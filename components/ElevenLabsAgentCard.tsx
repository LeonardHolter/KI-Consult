"use client";

import { useCallback, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";

// The ElevenLabs-pilot counterpart to VoiceAgentCard: same dashboard slot,
// same visual language, but the conversation runs against the client's
// ElevenLabs agent (lib/voiceDemo/elevenlabsAgents.ts) instead of OpenAI
// Realtime. Tool calls surface in the browser exactly like the WebRTC agent's
// do, and are relayed to the same authenticated executor
// (/api/portal/voice-agent/tools) — the server still decides sandbox vs live.
//
// Deliberately NOT wired up here (pilot scope): call recording and usage
// reporting. Both are OpenAI-session-shaped today; they come along if the
// pilot graduates.

type UiState = "idle" | "connecting" | "active" | "error";

/** Same date-context line mintClientSecret prepends server-side for the
 *  OpenAI agents — the ElevenLabs prompt receives it as a dynamic variable. */
function dateContextLine(): string {
  const now = new Date();
  const opts = { timeZone: "Europe/Oslo" } as const;
  const iso = new Intl.DateTimeFormat("en-CA", { ...opts, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const label = new Intl.DateTimeFormat("no", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("no", { ...opts, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return `Det er ${label} (${iso}), klokken er nå ${time}.`;
}

const BOOKING_TOOLS = [
  "get_available_demo_slots",
  "book_demo_slot",
  "lookup_vehicle",
  "add_booking_note",
  "find_my_bookings",
  "reschedule_booking",
] as const;

export default function ElevenLabsAgentCard({
  clientId,
  variant = "full",
}: {
  clientId?: string;
  variant?: "full" | "minimal";
}) {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const convRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  // finish_session contract (same as production): hang up only after the
  // farewell has finished PLAYING — the mode flip back to "listening" is the
  // signal, a 10 s timer the backstop.
  const hangupPendingRef = useRef(false);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endCall = useCallback(async () => {
    if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
    hangupTimerRef.current = null;
    hangupPendingRef.current = false;
    const conv = convRef.current;
    convRef.current = null;
    if (conv) await conv.endSession().catch(() => {});
    setUiState("idle");
    setAgentSpeaking(false);
  }, []);

  const runBookingTool = useCallback(
    (name: string) =>
      async (args: unknown): Promise<string> => {
        try {
          const res = await fetch("/api/portal/voice-agent/tools", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, name, arguments: args ?? {} }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) return JSON.stringify({ success: false, error: json.error ?? `HTTP ${res.status}` });
          return JSON.stringify(json.result ?? {});
        } catch {
          return JSON.stringify({ success: false, error: "Teknisk feil mot kalenderen." });
        }
      },
    [clientId],
  );

  const start = useCallback(async () => {
    setUiState("connecting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/portal/voice-agent/elevenlabs-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      const clientTools: Record<string, (args: unknown) => Promise<string> | void> = {};
      for (const name of BOOKING_TOOLS) clientTools[name] = runBookingTool(name);
      clientTools.finish_session = () => {
        hangupPendingRef.current = true;
        if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
        hangupTimerRef.current = setTimeout(() => void endCall(), 10_000);
      };

      convRef.current = await Conversation.startSession({
        signedUrl: json.signedUrl,
        connectionType: "websocket",
        dynamicVariables: { date_context: dateContextLine() },
        clientTools,
        onConnect: () => setUiState("active"),
        onDisconnect: () => {
          convRef.current = null;
          setUiState("idle");
          setAgentSpeaking(false);
        },
        onMessage: ({ source, message }: { source: string; message: string }) => {
          if (source !== "user" && message) setLastMessage(message);
        },
        onModeChange: ({ mode }: { mode: string }) => {
          setAgentSpeaking(mode === "speaking");
          if (mode === "listening" && hangupPendingRef.current) void endCall();
        },
        onError: (err: unknown) => {
          console.error("[elevenlabs-agent]", err);
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
      void endCall();
    }
  }, [clientId, endCall, runBookingTool]);

  const inCall = uiState === "active" || uiState === "connecting";

  return (
    <div className="vacm">
      <style>{`
        .vacm { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 0px; padding: 44px 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; min-height: 320px; }
        .vacm-circle { width: 148px; height: 148px; border-radius: 50%; border: none; cursor: pointer; transition: background .3s ease, box-shadow .3s ease; background: ${uiState === "active" ? "radial-gradient(circle at 50% 38%, #1ACE87, #15C07C)" : uiState === "connecting" ? "#d9d5c6" : "radial-gradient(circle at 50% 38%, #20241a, #16190f)"}; box-shadow: ${uiState === "active" ? "0 0 0 10px rgba(21,192,124,.14)" : "0 10px 30px rgba(22,25,15,.18)"}; }
        .vacm-circle.speaking { animation: vacm-pulse 1.05s ease-in-out infinite; }
        .vacm-circle.connecting { animation: vacm-breathe 1.6s ease-in-out infinite; }
        @keyframes vacm-pulse { 0%,100% { transform: scale(1); box-shadow: 0 0 0 10px rgba(21,192,124,.14); } 50% { transform: scale(1.1); box-shadow: 0 0 0 24px rgba(21,192,124,.07); } }
        @keyframes vacm-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .vacm-label { font-family: var(--font-space-mono), monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; color: ${uiState === "active" ? "#0d6b47" : "#9a9a8c"}; }
        .vacm-sub { font-family: var(--font-space-mono), monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #b5b3a4; }
        .vacm-msg { font-size: 13.5px; color: #5c5f52; max-width: 52ch; text-align: center; }
        .vacm-err { font-size: 13.5px; color: #c2562c; max-width: 46ch; text-align: center; }
      `}</style>
      <button
        type="button"
        aria-label={inCall ? "Legg på" : "Ring agenten"}
        className={`vacm-circle ${agentSpeaking ? "speaking" : ""} ${uiState === "connecting" ? "connecting" : ""}`}
        onClick={inCall ? () => void endCall() : () => void start()}
      />
      <div className="vacm-label">
        {uiState === "connecting"
          ? "Kobler til…"
          : uiState === "active"
            ? agentSpeaking
              ? "Agenten snakker"
              : "Lytter — si noe"
            : "Trykk for å ringe agenten"}
      </div>
      <div className="vacm-sub">ElevenLabs-pilot</div>
      {variant === "full" && lastMessage && <div className="vacm-msg">{lastMessage}</div>}
      {errorMsg && <div className="vacm-err">{errorMsg}</div>}
    </div>
  );
}
