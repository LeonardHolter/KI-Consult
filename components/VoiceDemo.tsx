"use client";

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

const mono = "var(--font-space-mono), monospace";

const DEFAULT_PROMPT = `Du er en vennlig norsk kundeservice-agent for et fiktivt strømselskap som heter "Fjordkraft Demo".
Du svarer kort, naturlig og høflig på norsk (bokmål). Du hjelper kunder med spørsmål om strømpris, faktura, måleravlesning og flytting.
Hvis du ikke vet svaret, sier du at du setter kunden over til en menneskelig rådgiver. Hold svarene korte — dette er en talesamtale.`;

interface Preset {
  label: string;
  prompt: string;
  firstMessage: string;
}

const PRESETS: Preset[] = [
  {
    label: "Strømselskap",
    prompt: DEFAULT_PROMPT,
    firstMessage:
      "Hei, du snakker med Fjordkraft Demo. Hva kan jeg hjelpe deg med i dag?",
  },
  {
    label: "Frisørsalong (booking)",
    prompt: `Du er resepsjonist for en frisørsalong i Oslo som heter "Klipp & Stil".
Du snakker naturlig norsk og hjelper kunder med å bestille, flytte eller avlyse timer.
Du spør om navn, ønsket tjeneste (klipp, farge, styling) og foretrukket tidspunkt. Hold svarene korte og hyggelige — dette er en talesamtale.`,
    firstMessage:
      "Hei og velkommen til Klipp og Stil! Vil du bestille en time i dag?",
  },
  {
    label: "Nettbutikk (support)",
    prompt: `Du er en kundestøtte-agent for en norsk nettbutikk som selger sportsutstyr.
Du svarer på spørsmål om ordrestatus, retur, frakt og produkter — alltid på naturlig norsk.
Be om ordrenummer når det trengs. Hold svarene korte og løsningsorienterte — dette er en talesamtale.`,
    firstMessage:
      "Hei! Du har kommet til kundeservice. Gjelder det en ordre, en retur, eller noe annet?",
  },
];

type UiState = "idle" | "connecting" | "active" | "error";

function VoiceDemoInner() {
  const [prompt, setPrompt] = useState(PRESETS[0].prompt);
  const [firstMessage, setFirstMessage] = useState(PRESETS[0].firstMessage);
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
      // The React SDK surfaces transcript text on the latest message.
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
      // Ask for the microphone up front for a clean permission prompt.
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
            prompt: { prompt },
            firstMessage,
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
  }, [prompt, firstMessage, startSession]);

  const stop = useCallback(() => {
    endSession();
    setUiState("idle");
  }, [endSession]);

  const applyPreset = (preset: Preset) => {
    if (uiState === "active" || uiState === "connecting") return;
    setPrompt(preset.prompt);
    setFirstMessage(preset.firstMessage);
  };

  const isBusy = uiState === "active" || uiState === "connecting";
  const statusLabel =
    uiState === "connecting" || status === "connecting"
      ? "Kobler til…"
      : uiState === "active"
        ? isSpeaking
          ? "Agenten snakker…"
          : "Lytter — si noe"
        : "Klar";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        alignItems: "stretch",
      }}
      className="voicedemo-grid"
    >
      {/* Prompt editor */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          padding: 24,
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
            marginBottom: 12,
          }}
        >
          Tilpass agenten
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {PRESETS.map((p) => {
            const active = p.prompt === prompt;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                disabled={isBusy}
                style={{
                  fontFamily: mono,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "7px 12px",
                  borderRadius: 8,
                  cursor: isBusy ? "default" : "pointer",
                  border: active
                    ? "1px solid #3FE0A0"
                    : "1px solid rgba(255,255,255,0.18)",
                  background: active ? "rgba(63,224,160,0.14)" : "transparent",
                  color: active ? "#3FE0A0" : "#AFC0B5",
                  opacity: isBusy && !active ? 0.5 : 1,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#AFC0B5",
            marginBottom: 6,
          }}
        >
          Systemprompt (instruksjon til agenten)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isBusy}
          rows={7}
          style={{
            width: "100%",
            resize: "vertical",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#0A1C14",
            color: "#EFEDE2",
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: "inherit",
            marginBottom: 14,
          }}
        />

        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#AFC0B5",
            marginBottom: 6,
          }}
        >
          Åpningsreplikk
        </label>
        <input
          type="text"
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value)}
          disabled={isBusy}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#0A1C14",
            color: "#EFEDE2",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
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
          <span style={{ fontSize: 44 }}>{uiState === "active" ? "🎙️" : "💬"}</span>
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
                ? "Snakk i mikrofonen — agenten svarer på norsk."
                : "Rediger prompten, trykk «Snakk med agenten» og tillat mikrofonen."}
        </p>

        {uiState === "active" || uiState === "connecting" ? (
          <button
            type="button"
            onClick={stop}
            style={{
              ...btnBase,
              background: "#C2562C",
              color: "#fff",
            }}
          >
            Avslutt samtale
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="btn-primary"
            style={{ ...btnBase, color: "#08231A" }}
          >
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
