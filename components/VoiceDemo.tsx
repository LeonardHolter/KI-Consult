"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ReplyWatchdog } from "@/lib/voiceDemo/replyWatchdog";

// WebRTC client for the OpenAI Realtime API — same connection architecture
// and the same reliability layers as the Handz On production agent
// (VoiceAgentCard.tsx), where every piece of this logic was debugged
// against live calls and is pinned by the test suite:
//  - ReplyWatchdog: the agent must never leave the caller in silence.
//  - finish_session hangup: waits for the closing audio to DRAIN, then a
//    5s grace window (the closing line promises the caller five seconds);
//    caller speech aborts the shutdown and tells the model to re-close.
//  - Bare finish_session (no closing spoken) gets answered with
//    say-your-closing-now instructions instead of a context-free nudge.

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
  const watchdogRef = useRef<ReplyWatchdog | null>(null);

  // Model-initiated hangup (finish_session): the disconnect waits for
  // output_audio_buffer.stopped so the closing line finishes PLAYING, then
  // a 5s grace window. Timers: 12s while no audio has come, swapped for a
  // generous 60s stuck-stream fallback once audio starts.
  const hangupPendingRef = useRef(false);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hangupCallIdRef = useRef<string | null>(null);
  const hangupRecoveriesRef = useRef(0);

  const cleanup = useCallback(() => {
    watchdogRef.current?.dispose();
    hangupPendingRef.current = false;
    hangupCallIdRef.current = null;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // The model hung up: end the call the same way the stop button does.
  const completeHangup = useCallback(() => {
    if (!hangupPendingRef.current) return;
    hangupPendingRef.current = false;
    cleanup();
    setUiState("idle");
    setAgentState("idle");
  }, [cleanup]);

  // The caller barged in on the closing: the call is NOT over. Report the
  // aborted hangup back as the tool result so the model knows it must
  // re-close — without this it believes it already hung up and the call
  // dangles forever after a reciprocal "takk, i like måte".
  const cancelHangup = useCallback(() => {
    if (!hangupPendingRef.current) return;
    hangupPendingRef.current = false;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    const callId = hangupCallIdRef.current;
    hangupCallIdRef.current = null;
    const dc = dcRef.current;
    if (callId && dc && dc.readyState === "open") {
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              success: false,
              reason:
                "Kunden fortsatte samtalen, så det ble ikke lagt på. Svar kunden, og kall finish_session på nytt i samme replikk som din neste avslutning.",
            }),
          },
        }),
      );
    }
  }, []);

  const handleServerEvent = useCallback(
    (ev: Record<string, unknown>) => {
      // The watchdog sees every event, before any case can break early.
      watchdogRef.current?.handle(ev);
      switch (ev.type) {
        case "response.output_item.done": {
          const item = ev.item as
            | { type?: string; call_id?: string; name?: string }
            | undefined;
          if (item?.type === "function_call" && item.call_id && item.name === "finish_session") {
            hangupPendingRef.current = true;
            hangupCallIdRef.current = item.call_id;
            if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
            hangupTimerRef.current = setTimeout(completeHangup, 12000);
          }
          break;
        }
        case "response.done": {
          // Bare finish_session — tool call with no closing spoken. Left
          // unanswered, the next context-free nudge makes the model
          // improvise confusion instead of the closing line. Answer it with
          // explicit instructions and ask for the closing NOW.
          const response = ev.response as
            | { output?: Array<{ type?: string; name?: string; content?: Array<{ type?: string }> }> }
            | undefined;
          const output = response?.output ?? [];
          const hasAudio = output.some(
            (i) => i.type === "message" && i.content?.some((c) => c.type === "output_audio"),
          );
          const calledFinish = output.some(
            (i) => i.type === "function_call" && i.name === "finish_session",
          );
          if (
            hangupPendingRef.current &&
            calledFinish &&
            !hasAudio &&
            hangupRecoveriesRef.current < 3
          ) {
            hangupRecoveriesRef.current += 1;
            const callId = hangupCallIdRef.current;
            const dc = dcRef.current;
            if (callId && dc && dc.readyState === "open") {
              dc.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({
                      success: true,
                      note: "Opphenget er klart og skjer automatisk når avslutningsreplikken din er ferdig spilt. Si avslutningsreplikken NÅ, og ikke kall finish_session på nytt.",
                    }),
                  },
                }),
              );
              dc.send(JSON.stringify({ type: "response.create" }));
              watchdogRef.current?.expectReply();
            }
          }
          break;
        }
        case "input_audio_buffer.speech_started":
          setAgentState("listening");
          // Caller speech during the shutdown sequence (closing playing, or
          // the 5s grace window after it) aborts the hangup.
          cancelHangup();
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
          // The closing audio is actually playing — the short "audio never
          // came" safety timer must not kill it mid-sentence. From here the
          // stopped event owns the hangup; keep a stuck-stream fallback.
          if (hangupPendingRef.current) {
            if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
            hangupTimerRef.current = setTimeout(completeHangup, 60000);
          }
          break;
        case "output_audio_buffer.stopped":
          setAgentState("idle");
          // The closing has finished playing — hang up after the 5s grace
          // window the closing line promises the caller.
          if (hangupPendingRef.current) {
            if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
            hangupTimerRef.current = setTimeout(completeHangup, 5000);
          }
          break;
        case "output_audio_buffer.cleared":
          setAgentState("idle");
          // cleared = the caller interrupted the closing — they have more
          // to say, so the call continues instead of hanging up on them.
          cancelHangup();
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
    },
    [completeHangup, cancelHangup],
  );

  const start = useCallback(async () => {
    setErrorMsg(null);
    setLastMessage(null);
    assistantTextRef.current = "";
    setUiState("connecting");
    setAgentState("idle");
    hangupRecoveriesRef.current = 0;

    // Owns the "agent must never leave the caller in silence" contract —
    // same watchdog as the production agent; full history and every
    // scenario live in lib/voiceDemo/replyWatchdog.ts and its eval suite.
    watchdogRef.current?.dispose();
    watchdogRef.current = new ReplyWatchdog({
      send: () => {
        const dc = dcRef.current;
        if (dc && dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      },
      log: (note, detail) => console.warn(`[voice-watchdog] ${note}`, detail ?? ""),
    });

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
        watchdogRef.current?.expectReply();
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
