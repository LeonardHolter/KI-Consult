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

  const handleServerEvent = useCallback((ev: Record<string, any>) => {
    pushEvent("in", String(ev.type), ev);
    switch (ev.type) {
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
    async (settings: VoiceDemoSettings & { instructions: string }) => {
      setError(null);
      setStatus("connecting");
      setTranscript([]);
      setEvents([]);
      setAgentState("idle");

      try {
        const sessionRes = await fetch("/api/portal/voice-demo/test-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
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
  }, []);

  return { status, agentState, transcript, events, error, connect, disconnect };
}
