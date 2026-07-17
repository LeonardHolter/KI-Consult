"use client";

import { useCallback, useRef, useState } from "react";

// WebRTC connection to the client's saved voice agent (settings live in
// Supabase, tuned from /portal/voice-demo). Same architecture as the
// marketing site's demo and the handzon-voice-lab tuning lab — just pointed
// at /api/portal/voice-agent/session so it always uses this client's saved
// config instead of a hardcoded or draft one.

type UiState = "idle" | "connecting" | "active" | "error";

export default function VoiceAgentCard({ clientId }: { clientId?: string }) {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
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

  const handleServerEvent = useCallback((ev: Record<string, unknown>) => {
    switch (ev.type) {
      case "response.output_audio_transcript.delta":
        assistantTextRef.current += String(ev.delta ?? "");
        setLastMessage(assistantTextRef.current);
        break;
      case "response.output_audio_transcript.done":
        assistantTextRef.current = String(ev.transcript ?? assistantTextRef.current);
        setLastMessage(assistantTextRef.current);
        break;
      case "response.output_item.added":
        assistantTextRef.current = "";
        break;
      case "output_audio_buffer.started":
        setAgentSpeaking(true);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setAgentSpeaking(false);
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
    setAgentSpeaking(false);

    try {
      const res = await fetch("/api/portal/voice-agent/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        model?: string;
        message?: string;
      };
      if (!res.ok || !body.clientSecret) {
        throw new Error(body.message ?? "Klarte ikke å koble til agenten.");
      }

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
  }, [cleanup, handleServerEvent, clientId]);

  const stop = useCallback(() => {
    cleanup();
    setUiState("idle");
    setAgentSpeaking(false);
  }, [cleanup]);

  const statusLabel =
    uiState === "connecting"
      ? "Kobler til…"
      : uiState === "active"
        ? agentSpeaking
          ? "Agenten snakker…"
          : "Lytter — si noe"
        : "Klar";

  return (
    <div className="vac">
      <style>{`
        .vac { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 14px; padding: 22px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .vac-orb { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 24px; transition: all .25s ease; background: ${uiState === "active" ? "radial-gradient(circle at 50% 40%, #1ACE87, #15C07C)" : "#f3efe4"}; box-shadow: ${uiState === "active" ? "0 0 0 6px rgba(21,192,124,.16)" : "none"}; }
        .vac-orb.speaking { animation: vac-pulse 1.1s ease-in-out infinite; }
        @keyframes vac-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        .vac-body { flex: 1; min-width: 220px; }
        .vac-status { font-family: var(--font-space-mono), monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; color: ${uiState === "active" ? "#0d6b47" : "#9a9a8c"}; }
        .vac-msg { font-size: 13.5px; color: #5c5f52; margin-top: 4px; max-width: 52ch; }
        .vac-btn { padding: 10px 18px; border-radius: 10px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .vac-btn.primary { background: #15c07c; color: #08231a; }
        .vac-btn.stop { background: #C2562C; color: #fff; }
      `}</style>

      <div className={`vac-orb ${agentSpeaking ? "speaking" : ""}`}>
        {uiState === "active" ? "🎙️" : "📞"}
      </div>

      <div className="vac-body">
        <div className="vac-status">{statusLabel}</div>
        <div className="vac-msg">
          {errorMsg
            ? errorMsg
            : lastMessage
              ? `"${lastMessage}"`
              : uiState === "active"
                ? "Snakk i mikrofonen."
                : "Snakk med agenten akkurat slik kundene dine gjør."}
        </div>
      </div>

      {uiState === "active" || uiState === "connecting" ? (
        <button type="button" className="vac-btn stop" onClick={stop}>
          Legg på
        </button>
      ) : (
        <button type="button" className="vac-btn primary" onClick={start}>
          Snakk med agenten →
        </button>
      )}
    </div>
  );
}
