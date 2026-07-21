"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReplyWatchdog } from "./replyWatchdog";
import type { CallEvent, TranscriptItem, VoiceDemoSettings } from "./types";

// WebRTC test client for the admin tuner — same connection architecture as
// the handzon-voice-lab tuning lab (mint ephemeral secret server-side, then
// RTCPeerConnection with mic track + "oai-events" data channel), but talks
// to /api/portal/voice-demo/test-session so unsaved draft settings can be
// heard before they're saved to the public demo.

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type AgentState = "idle" | "listening" | "speaking";

// High enough to hold a full multi-minute test call with payloads — this log
// is the primary diagnosis surface for silent-agent incidents, and a capped
// log has already cost us the decisive evidence once.
const MAX_EVENTS = 2000;

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

  // Owns the "agent must never leave the caller in silence" contract. Four
  // inline predecessors of this were patched against live calls and each
  // still had a hole; the full history and every scenario live in
  // lib/voiceDemo/replyWatchdog.ts and its eval suite.
  const watchdogRef = useRef<ReplyWatchdog | null>(null);

  // Mic level meter, logged into the event log. Exists to settle the echo
  // question: if the server reports speech_started while our own mic energy
  // stayed quiet, the "speech" was the agent's playback leaking back in —
  // which would explain both the phantom barge-ins (the ✂ klippet marks)
  // and ghost caller turns like «Nei, men det er nydelig».
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Playback-side meter, the counterpart to the mic meter. A live call
  // reported confirmation questions "written but not spoken" while the
  // server log showed full-length audio windows and zero truncations for
  // those exact sentences — meaning if the audio was lost, it was lost
  // LOCALLY (element/device), the one hop the server events can't see.
  // This meters what actually flows out of the remote stream, so the next
  // such report shows either playback.level: voice (audio reached the
  // browser — device/volume problem) or silence (stream-level problem).
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Model-initiated hangup (finish_session): the disconnect waits for the
  // farewell audio to finish playing (output_audio_buffer.stopped) —
  // disconnecting on the tool call itself would cut «Ha det bra!» mid-air.
  // disconnectRef exists because disconnect is defined below the memoised
  // event handler that needs it.
  const hangupPendingRef = useRef(false);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

  const completeHangup = () => {
    if (!hangupPendingRef.current) return;
    hangupPendingRef.current = false;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    pushEvent("out", "finish_session — samtalen legges på", {});
    disconnectRef.current?.();
  };

  // The caller barged in on the farewell: the call is NOT over. The model
  // handles their turn and calls finish_session again when it re-closes.
  const cancelHangup = () => {
    if (!hangupPendingRef.current) return;
    hangupPendingRef.current = false;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    pushEvent("out", "finish_session avbrutt — kunden snakket, samtalen fortsetter", {});
  };

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
      // needs an explicit nudge. The watchdog owns what happens if that
      // nudge produces silence.
      dc.send(JSON.stringify({ type: "response.create" }));
      watchdogRef.current?.expectReply();
      pushEvent("out", "function_call_output", { name, output });
    },
    [],
  );

  const handleServerEvent = useCallback((ev: Record<string, any>) => {
    pushEvent("in", String(ev.type), ev);
    // The watchdog sees every event, before any case can break early.
    watchdogRef.current?.handle(ev);
    switch (ev.type) {
      // See VoiceAgentCard: read the completed function_call ITEM, since
      // response.function_call_arguments.done has no call_id and the output
      // can't be matched back to the call without it.
      case "response.output_item.done": {
        const item = ev.item as
          | { type?: string; call_id?: string; name?: string; arguments?: string }
          | undefined;
        if (item?.type === "function_call" && item.call_id && item.name) {
          if (item.name === "finish_session") {
            // Client-side tool: never relayed to the server executor. The
            // disconnect waits for output_audio_buffer.stopped so the
            // farewell finishes playing; a barge-in cancels instead (see
            // the cleared case). The watchdog stays alive until the hangup
            // actually lands, in case the call continues. Safety timer in
            // case neither stopped nor cleared ever arrives.
            hangupPendingRef.current = true;
            hangupTimerRef.current = setTimeout(completeHangup, 12000);
            pushEvent("in", "finish_session — venter på at avskjeden spilles ferdig", {});
            break;
          }
          void runToolCall(item.call_id, item.name, item.arguments ?? "{}");
        }
        break;
      }
      case "input_audio_buffer.speech_started":
        setAgentState("listening");
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
      // The session is audio-only by config, but the model has been seen
      // falling out of audio modality and emitting text. The caller hears
      // nothing, and until this case existed the transcript showed nothing
      // either — invisible silence. Render it, loudly marked, so a modality
      // fallout is diagnosable at a glance.
      case "response.output_text.delta": {
        const itemId = String(ev.item_id ?? "assistant");
        const delta = String(ev.delta ?? "");
        setTranscript((prev) => {
          const existing = prev.find((t) => t.id === itemId && t.kind === "assistant");
          if (existing && existing.kind === "assistant") {
            return prev.map((t) =>
              t.id === itemId && t.kind === "assistant" ? { ...t, text: t.text + delta } : t,
            );
          }
          return [
            ...prev,
            {
              kind: "assistant",
              id: itemId,
              text: `[KUN TEKST — ingen lyd] ${delta}`,
              at: Date.now(),
              done: false,
            },
          ];
        });
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

        // Silence recovery lives in the ReplyWatchdog (fed above), which
        // also covers the case this handler structurally can't: a committed
        // caller turn where no response.done ever arrives.
        break;
      }
      case "output_audio_buffer.started":
        setAgentState("speaking");
        break;
      case "output_audio_buffer.stopped":
        if (agentState === "speaking") setAgentState("idle");
        // The farewell has finished playing — now the hangup can land.
        if (hangupPendingRef.current) completeHangup();
        break;
      case "output_audio_buffer.cleared":
        if (agentState === "speaking") setAgentState("idle");
        // cleared = the caller interrupted the farewell — they have more to
        // say, so the call continues instead of hanging up on them.
        cancelHangup();
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
      hangupPendingRef.current = false;
      if (hangupTimerRef.current) {
        clearTimeout(hangupTimerRef.current);
        hangupTimerRef.current = null;
      }

      watchdogRef.current?.dispose();
      watchdogRef.current = new ReplyWatchdog({
        send: () => {
          const dc = dcRef.current;
          if (dc && dc.readyState === "open") {
            dc.send(JSON.stringify({ type: "response.create" }));
          }
        },
        // Every decision lands in the event log — this trail is the whole
        // point; the silent-agent bug survived four fixes because the
        // decisions were invisible.
        log: (note, detail) => pushEvent("out", `watchdog: ${note}`, detail ?? {}),
      });

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

        // Diagnostic mic meter: logs voice/quiet transitions with RMS energy
        // so server-side speech_started events can be checked against what
        // the mic actually picked up. Best-effort — a meter failure must
        // never break the call.
        try {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          ctx.createMediaStreamSource(mic).connect(analyser);
          const buf = new Float32Array(analyser.fftSize);
          let wasLoud = false;
          meterTimerRef.current = setInterval(() => {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            const loud = rms > 0.02;
            if (loud !== wasLoud) {
              wasLoud = loud;
              pushEvent("in", loud ? "mic.level: voice" : "mic.level: quiet", {
                rms: Number(rms.toFixed(4)),
              });
            }
          }, 250);
        } catch {
          /* meter is diagnostic only */
        }

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
          // Meter the agent's audio as it arrives in the browser (see
          // playbackTimerRef). Best-effort: metering must never break
          // playback. Reading the stream in an AudioContext is safe because
          // the element above also consumes it — Chrome only pumps WebRTC
          // audio through an AudioContext when a media element is attached.
          try {
            const ctx = audioCtxRef.current;
            if (ctx && !playbackTimerRef.current) {
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 2048;
              ctx.createMediaStreamSource(e.streams[0]).connect(analyser);
              const buf = new Float32Array(analyser.fftSize);
              let wasLoud = false;
              playbackTimerRef.current = setInterval(() => {
                analyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                const loud = rms > 0.01;
                if (loud !== wasLoud) {
                  wasLoud = loud;
                  pushEvent("in", loud ? "playback.level: voice" : "playback.level: quiet", {
                    rms: Number(rms.toFixed(4)),
                  });
                }
              }, 250);
            }
          } catch {
            /* meter is diagnostic only */
          }
        };
        // Element-level stalls (pause/suspend/stalled) are the other way
        // local playback dies silently — surface them in the log too.
        for (const evName of ["playing", "pause", "stalled", "suspend", "ended"] as const) {
          audioEl[`on${evName}`] = () => pushEvent("in", `audioEl.${evName}`, {});
        }
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
          watchdogRef.current?.expectReply();
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
    watchdogRef.current?.dispose();
    hangupPendingRef.current = false;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setStatus("disconnected");
    setAgentState("idle");
  }, []);

  // Keep the ref pointing at the current disconnect so completeHangup (used
  // inside the memoised event handler above) never goes stale.
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  return { status, agentState, transcript, events, error, connect, disconnect };
}
