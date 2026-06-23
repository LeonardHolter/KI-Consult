"use client";

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

const mono = "var(--font-space-mono), monospace";

const PROMPT = `Du er resepsjonist for et tannlegesenter i Oslo som heter "Oslo Tannlegesenter".
Du snakker naturlig norsk og hjelper pasienter med å bestille, flytte eller avlyse timer hos tannlegen.
Du spør om navn, hva pasienten trenger hjelp med (undersøkelse, fyll, rens, akutt), og ønsket tidspunkt.
Du kan gi generell info om åpningstider (mandag–fredag 08–17) og priser (undersøkelse 650 kr).
Hold svarene korte og hyggelige - dette er en talesamtale.`;

const FIRST_MESSAGE =
  "Hei, du har ringt Oslo Tannlegesenter. Hva kan jeg hjelpe deg med i dag?";

type UiState = "idle" | "connecting" | "active" | "error";

function VoiceDemoInner() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => setUiState("active"),
    onDisconnect: () => setUiState("idle"),
    onError: (message) => {
      setErrorMsg(typeof message === "string" ? message : "Noe gikk galt.");
      setUiState("error");
    },
    onMessage: (event) => {
      const text = (event as { message?: string })?.message;
      if (typeof text === "string" && text.trim()) setLastMessage(text);
    },
  });

  const { status, isSpeaking, startSession, endSession } = conversation;

  const start = useCallback(async () => {
    setErrorMsg(null);
    setLastMessage(null);
    setUiState("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const res = await fetch("/api/elevenlabs/token");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          body.message ??
            (res.status === 503
              ? "Live-demoen er ikke konfigurert ennå."
              : "Klarte ikke å koble til agenten."),
        );
      }
      const { token } = (await res.json()) as { token: string };

      startSession({
        conversationToken: token,
        connectionType: "webrtc",
        overrides: {
          agent: {
            prompt: { prompt: PROMPT },
            firstMessage: FIRST_MESSAGE,
            language: "no",
          },
        },
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mikrofontilgang ble avslått. Tillat mikrofonen for å snakke med agenten."
          : err instanceof Error
            ? err.message
            : "Noe gikk galt.";
      setErrorMsg(message);
      setUiState("error");
    }
  }, [startSession]);

  const stop = useCallback(() => {
    endSession();
    setUiState("idle");
  }, [endSession]);

  const statusLabel =
    uiState === "connecting" || status === "connecting"
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

export default function VoiceDemo() {
  return (
    <ConversationProvider>
      <VoiceDemoInner />
    </ConversationProvider>
  );
}
