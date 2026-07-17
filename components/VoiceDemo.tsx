"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// WebRTC client for the OpenAI Realtime API — same connection architecture as
// the handzon-voice-lab tuning lab: mint ephemeral secret server-side, then
// RTCPeerConnection with mic track + "oai-events" data channel, SDP exchange
// with /v1/realtime/calls. https://developers.openai.com/api/docs/guides/realtime

const mono = "var(--font-space-mono), monospace";

type UiState = "idle" | "connecting" | "active" | "error";
type AgentState = "idle" | "listening" | "speaking";

export default function VoiceDemo() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantTextRef = useRef<string>("");

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleServerEvent = useCallback((ev: Record<string, unknown>) => {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setAgentState("listening");
        break;
      case "response.output_audio_transcript.delta": {
        assistantTextRef.current += String(ev.delta ?? "");
        setLastMessage(assistantTextRef.current);
        break;
      }
      case "response.output_audio_transcript.done": {
        assistantTextRef.current = String(ev.transcript ?? assistantTextRef.current);
        setLastMessage(assistantTextRef.current);
        break;
      }
      case "response.output_item.added":
        assistantTextRef.current = "";
        break;
      case "output_audio_buffer.started":
        setAgentState("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setAgentState("idle");
        break;
      case "error":
        setErrorMsg(
          typeof (ev.error as { message?: string })?.message === "string"
            ? (ev.error as { message: string }).message
            : "Noe gikk galt.",
        );
        setUiState("error");
        break;
    }
  }, []);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setLastMessage(null);
    assistantTextRef.current = "";
    setUiState("connecting");
    setAgentState("idle");

    try {
      const res = await fetch("/api/voice/session", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        model?: string;
        message?: string;
      };
      if (!res.ok || !body.clientSecret) {
        throw new Error(
          body.message ??
            (res.status === 503
              ? "Live-demoen er ikke konfigurert ennå."
              : "Klarte ikke å koble til agenten."),
        );
      }

      // Explicit echo cancellation matters: without it, the mic can pick up
      // the agent's own trailing audio and false-trigger VAD, clipping the
      // agent's last word as an automatic barge-in interrupt.
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
        setUiState("active");
        dc.send(JSON.stringify({ type: "response.create" }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(body.model ?? "gpt-realtime")}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${body.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      );
      if (!sdpRes.ok) throw new Error(`Tilkobling feilet: ${await sdpRes.text()}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setErrorMsg("Tilkoblingen falt ut.");
          setUiState("error");
        }
      };
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mikrofontilgang ble avslått. Tillat mikrofonen for å snakke med agenten."
          : err instanceof Error
            ? err.message
            : "Noe gikk galt.";
      setErrorMsg(message);
      setUiState("error");
      cleanup();
    }
  }, [cleanup, handleServerEvent]);

  const stop = useCallback(() => {
    cleanup();
    setUiState("idle");
    setAgentState("idle");
  }, [cleanup]);

  const isSpeaking = agentState === "speaking";
  const statusLabel =
    uiState === "connecting"
      ? "Kobler til…"
      : uiState === "active"
        ? isSpeaking
          ? "Agenten snakker…"
          : "Lytter - si noe"
        : "Klar";

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "stretch" }}
      className="voicedemo-grid"
    >
      {/* Info panel */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#3FE0A0",
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          🦷 Demo - Tannlegesenter
        </div>
        <h3
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#EFEDE2",
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          Oslo Tannlegesenter
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#AFC0B5", margin: "0 0 22px" }}>
          Snakk med resepsjonisten og bestill time, spør om priser, eller få hjelp med andre
          henvendelser.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            "Bestille eller endre time",
            "Spørsmål om priser og behandlinger",
            "Akutte henvendelser",
          ].map((item) => (
            <div
              key={item}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#AFC0B5" }}
            >
              <span style={{ color: "#3FE0A0", fontSize: 12 }}>✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Call panel */}
      <div
        style={{
          background: "#FBFAF4",
          color: "#16190F",
          borderRadius: 18,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          minHeight: 320,
        }}
      >
        {/* Orb */}
        <div
          style={{
            width: 116,
            height: 116,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              uiState === "active"
                ? "radial-gradient(circle at 50% 40%, #1ACE87, #15C07C)"
                : "#E9E3D4",
            boxShadow:
              uiState === "active"
                ? "0 0 0 10px rgba(21,192,124,0.16), 0 0 0 22px rgba(21,192,124,0.08)"
                : "none",
            transition: "all 0.25s ease",
            animation: isSpeaking ? "voicedemo-pulse 1.1s ease-in-out infinite" : undefined,
          }}
        >
          <span style={{ fontSize: 44 }}>{uiState === "active" ? "🎙️" : "🦷"}</span>
        </div>

        <div
          style={{
            fontFamily: mono,
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: uiState === "active" ? "#15A06A" : "#8A8B7C",
            fontWeight: 700,
            marginTop: 20,
          }}
        >
          {statusLabel}
        </div>

        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.5,
            color: "#5C5F52",
            margin: "10px 0 20px",
            minHeight: 44,
            maxWidth: "32ch",
          }}
        >
          {errorMsg
            ? errorMsg
            : lastMessage
              ? `"${lastMessage}"`
              : uiState === "active"
                ? "Snakk i mikrofonen - agenten svarer på norsk."
                : "Trykk på knappen og tillat mikrofonen for å starte."}
        </p>

        {uiState === "active" || uiState === "connecting" ? (
          <button type="button" onClick={stop} style={{ ...btnBase, background: "#C2562C", color: "#fff" }}>
            Avslutt samtale
          </button>
        ) : (
          <button type="button" onClick={start} className="btn-primary" style={{ ...btnBase, color: "#08231A" }}>
            Snakk med agenten →
          </button>
        )}

        <div style={{ fontSize: 12, color: "#9A9A8C", marginTop: 14 }}>
          Krever mikrofon · WebRTC · norsk stemme
        </div>
      </div>

      <style>{`
        @keyframes voicedemo-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @media (max-width: 820px) {
          .voicedemo-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const btnBase: CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  padding: "15px 28px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
};
