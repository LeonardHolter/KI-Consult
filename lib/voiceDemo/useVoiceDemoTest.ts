"use client";

import { useCallback, useRef, useState } from "react";
import type { CallEvent, TranscriptItem, VoiceDemoSettings } from "./types";

// WebRTC test client for the admin tuner — same connection architecture as
// the handzon-voice-lab tuning lab (mint ephemeral secret server-side, then
// RTCPeerConnection with mic track + "oai-events" data channel), but talks
// to /api/portal/voice-demo/test-session so unsaved draft settings can be
// heard before they're saved to the public demo.

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type AgentState = "idle" | "listening" | "speaking";

const MAX_EVENTS = 400;

export function useVoiceDemoTest() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pushEvent = (dir: "in" | "out", type: string, payload: unknown) => {
    setEvents((prev) => {
      const next = [...prev, { at: Date.now(), dir, type, payload }];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  };

  // Which client's calendar tool calls resolve against. Captured on connect so
  // handleServerEvent (which is memoised with no deps) can reach it.
  const clientIdRef = useRef<string | null>(null);

  // The Realtime session occasionally produces a genuinely empty turn:
  // response.created -> response.done, status "completed", zero output
  // items — no audio, nothing spoken. First seen right after a tool-result
  // nudge (the model booked successfully but never said so, needing up to 3
  // retries in a row before it recovered). Confirmed AGAIN later happening
  // after a perfectly ordinary, uninterrupted user turn (a phone-number
  // confirmation) — no tool call anywhere nearby. So this isn't a
  // tool-call-specific problem, it's a general session reliability gap:
  // this receptionist should NEVER intentionally say nothing in response to
  // a committed customer turn (see the "avslutt alltid replikken" prompt
  // rule), so any "completed" response with empty output is always a bug,
  // never deliberate — response.done below retries it unconditionally, on
  // ANY trigger, not just after our own tool nudge.
  //
  // Deliberately NOT applied when status isn't "completed" (e.g.
  // "cancelled" from a barge-in truncation — the tuner's "✂ klippet"
  // marker): the caller is mid-interruption there, and forcing a new
  // response could talk over whatever they're about to say next.
  const emptyReplyRetriesRef = useRef(0);
  const MAX_EMPTY_REPLY_RETRIES = 5;
  const EMPTY_REPLY_RETRY_DELAY_MS = 400;

  // Whether the caller is mid-utterance right now. This — not the response
  // status — is what decides if a silent turn is safe to retry.
  //
  // Earlier attempts gated the retry on status === "completed" and skipped
  // "cancelled", assuming cancelled always meant barge-in. That was a guess,
  // and it was wrong: a confirmed-silent turn (caller gave a phone number,
  // agent went mute) never fired the retry, so the status must have been
  // something else. Rather than keep guessing which status values OpenAI
  // emits, use the invariant that actually matters — if the agent produced
  // NO output and the caller isn't speaking, the conversation is dead and
  // must be revived, whatever the server called it. If the caller IS
  // speaking, stay quiet: a real response is coming anyway, and retrying
  // would talk over them.
  const userSpeakingRef = useRef(false);

  // Realtime tool calls land in the browser, since the WebRTC session is a
  // direct browser<->OpenAI connection. Relay to the authenticated executor
  // and hand the result back over the data channel. Mirrors VoiceAgentCard —
  // the tuner needs it too, or testing a tool-using prompt here silently
  // behaves differently from the real dashboard agent.
  const runToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      let output: unknown;
      try {
        const res = await fetch("/api/portal/voice-agent/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            name,
            arguments: argsJson ? JSON.parse(argsJson) : {},
          }),
        });
        const body = await res.json().catch(() => ({}));
        output = res.ok ? body.result : { success: false, error: body.error ?? "Verktøyet feilet." };
      } catch {
        output = { success: false, error: "Fikk ikke kontakt med kalenderen." };
      }

      const dc = dcRef.current;
      if (!dc || dc.readyState !== "open") return;
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
        }),
      );
      // The model does not continue on its own after a tool result — it
      // needs an explicit nudge. If THIS nudge comes back empty, the
      // general retry in response.done below (not scoped to tool calls)
      // picks it up.
      dc.send(JSON.stringify({ type: "response.create" }));
      pushEvent("out", "function_call_output", { name, output });
    },
    [],
  );

  const handleServerEvent = useCallback((ev: Record<string, any>) => {
    pushEvent("in", String(ev.type), ev);
    switch (ev.type) {
      // See VoiceAgentCard: read the completed function_call ITEM, since
      // response.function_call_arguments.done has no call_id and the output
      // can't be matched back to the call without it.
      case "response.output_item.done": {
        const item = ev.item as
          | { type?: string; call_id?: string; name?: string; arguments?: string }
          | undefined;
        if (item?.type === "function_call" && item.call_id && item.name) {
          void runToolCall(item.call_id, item.name, item.arguments ?? "{}");
        }
        break;
      }
      case "input_audio_buffer.speech_started":
        userSpeakingRef.current = true;
        setAgentState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        userSpeakingRef.current = false;
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript ?? "").trim();
        if (text) {
          setTranscript((prev) => [
            ...prev,
            { kind: "user", id: String(ev.item_id ?? Date.now()), text, at: Date.now() },
          ]);
        }
        break;
      }
      case "response.output_audio_transcript.delta": {
        const itemId = String(ev.item_id ?? "assistant");
        const delta = String(ev.delta ?? "");
        setTranscript((prev) => {
          const existing = prev.find((t) => t.id === itemId && t.kind === "assistant");
          if (existing && existing.kind === "assistant") {
            return prev.map((t) =>
              t.id === itemId && t.kind === "assistant" ? { ...t, text: t.text + delta } : t,
            );
          }
          return [...prev, { kind: "assistant", id: itemId, text: delta, at: Date.now(), done: false }];
        });
        break;
      }
      case "response.output_audio_transcript.done": {
        const itemId = String(ev.item_id ?? "assistant");
        setTranscript((prev) =>
          prev.map((t) =>
            t.id === itemId && t.kind === "assistant"
              ? { ...t, text: String(ev.transcript ?? t.text), done: true }
              : t,
          ),
        );
        break;
      }
      case "response.done": {
        // A response that ends as anything other than "completed" had its
        // audio cut before finishing — flag the bubble(s) it produced.
        const respStatus = ev.response?.status;
        if (respStatus && respStatus !== "completed") {
          const ids = new Set<string>(
            (ev.response?.output ?? [])
              .filter((it: any) => it?.type === "message" && it?.role === "assistant")
              .map((it: any) => String(it.id)),
          );
          setTranscript((prev) => {
            const matched = ids.size && prev.some((t) => t.kind === "assistant" && ids.has(t.id));
            const lastAssistantId = matched
              ? null
              : [...prev].reverse().find((t) => t.kind === "assistant")?.id;
            return prev.map((t) =>
              t.kind === "assistant" && (ids.has(t.id) || t.id === lastAssistantId)
                ? { ...t, clipped: true }
                : t,
            );
          });
        }

        // Zero output means the agent said nothing at all. Status is
        // deliberately NOT part of this test — see userSpeakingRef above for
        // why guessing at status values kept missing the real failures. The
        // only thing that makes silence acceptable is the caller currently
        // talking (a real response is coming, and retrying would talk over
        // them).
        const output = ev.response?.output ?? [];
        const deadTurn = output.length === 0 && !userSpeakingRef.current;

        if (deadTurn && emptyReplyRetriesRef.current < MAX_EMPTY_REPLY_RETRIES) {
          emptyReplyRetriesRef.current += 1;
          const attempt = emptyReplyRetriesRef.current;
          setTimeout(() => {
            // Re-check at fire time: the caller may have started speaking
            // during the delay, in which case stay quiet.
            if (userSpeakingRef.current) return;
            const dc = dcRef.current;
            if (dc && dc.readyState === "open") {
              dc.send(JSON.stringify({ type: "response.create" }));
              pushEvent("out", "response.create", {
                note: `retry-empty-reply-${attempt}`,
                afterStatus: respStatus ?? "unknown",
              });
            }
          }, EMPTY_REPLY_RETRY_DELAY_MS);
        } else if (output.length > 0) {
          // Only a turn that actually produced something resets the budget.
          // A silent turn skipped because the caller was mid-sentence must
          // NOT refill it, or a talkative caller could reset the counter
          // indefinitely and mask a genuinely stuck session.
          emptyReplyRetriesRef.current = 0;
        }
        break;
      }
      case "output_audio_buffer.started":
        setAgentState("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        if (agentState === "speaking") setAgentState("idle");
        break;
      case "error":
        setError(ev.error?.message ?? JSON.stringify(ev.error ?? ev));
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (
      settings: VoiceDemoSettings & { instructions: string },
      clientId?: string,
    ) => {
      setError(null);
      setStatus("connecting");
      setTranscript([]);
      setEvents([]);
      setAgentState("idle");
      clientIdRef.current = clientId ?? null;
      // A previous call's disconnect() maxes this out to block any stale
      // retry timeout; a fresh call needs it back at 0.
      emptyReplyRetriesRef.current = 0;
      // A call that ended mid-utterance would otherwise leave this stuck
      // true and suppress every retry on the next call.
      userSpeakingRef.current = false;

      try {
        const sessionRes = await fetch("/api/portal/voice-demo/test-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientId ? { ...settings, clientId } : settings),
        });
        const sessionBody = await sessionRes.json();
        if (!sessionRes.ok) throw new Error(sessionBody.message ?? "Klarte ikke å starte testsamtale");
        const clientSecret: string = sessionBody.clientSecret;

        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        micRef.current = mic;

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        let audioEl = audioRef.current;
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          audioRef.current = audioEl;
        }
        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0];
        };
        pc.addTrack(mic.getTracks()[0], mic);

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onmessage = (e) => {
          try {
            handleServerEvent(JSON.parse(e.data));
          } catch {
            /* ignore malformed */
          }
        };
        dc.onopen = () => {
          setStatus("connected");
          dc.send(JSON.stringify({ type: "response.create" }));
          pushEvent("out", "response.create", { note: "greet-first" });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdpRes = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sessionBody.model ?? settings.model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${clientSecret}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp,
          },
        );
        if (!sdpRes.ok) throw new Error(`SDP-utveksling feilet: ${await sdpRes.text()}`);
        await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

        pc.onconnectionstatechange = () => {
          pushEvent("in", `connection.${pc.connectionState}`, { connectionState: pc.connectionState });
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setError("WebRTC-tilkoblingen falt ut.");
          }
        };
      } catch (e) {
        setStatus("disconnected");
        setAgentState("idle");
        setError(e instanceof Error ? e.message : String(e));
        micRef.current?.getTracks().forEach((t) => t.stop());
        pcRef.current?.close();
      }
    },
    [handleServerEvent],
  );

  const disconnect = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setStatus("disconnected");
    setAgentState("idle");
    // Stop any pending retry from firing after the call has already ended.
    emptyReplyRetriesRef.current = MAX_EMPTY_REPLY_RETRIES;
  }, []);

  return { status, agentState, transcript, events, error, connect, disconnect };
}
