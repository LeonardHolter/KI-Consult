"use client";

import { useCallback, useRef, useState } from "react";

// WebRTC connection to the client's saved voice agent (settings live in
// Supabase, tuned from /portal/voice-demo). Same architecture as the
// marketing site's demo and the handzon-voice-lab tuning lab — just pointed
// at /api/portal/voice-agent/session so it always uses this client's saved
// config instead of a hardcoded or draft one.

type UiState = "idle" | "connecting" | "active" | "error";

export default function VoiceAgentCard({
  clientId,
  unavailable,
}: {
  clientId?: string;
  /** Shows a disabled placeholder instead of a working call button — for
   *  rolling the feature out to admin first while it's still being tuned. */
  unavailable?: boolean;
}) {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantTextRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const usageRef = useRef({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  // Reports the finished call's duration + token usage — the only place any
  // of this is ever learned, since the WebRTC audio is a direct browser<->
  // OpenAI connection that never touches our backend. Best-effort: a failed
  // report shouldn't surface to the user, they've already hung up.
  const reportUsage = useCallback(() => {
    if (!startedAtRef.current) return;
    const endedAt = Date.now();
    const startedAt = startedAtRef.current;
    startedAtRef.current = 0;
    fetch("/api/portal/voice-agent/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationSeconds: (endedAt - startedAt) / 1000,
        usage: usageRef.current,
      }),
    }).catch(() => {
      /* best-effort — the call itself already ended fine */
    });
    usageRef.current = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  }, [clientId]);

  // Realtime tool calls arrive HERE, in the browser, because the WebRTC
  // session is a direct browser<->OpenAI connection. We can't execute them
  // client-side (the calendar needs server credentials), so we relay to
  // /api/portal/voice-agent/tools and hand the result back over the data
  // channel. The server decides sandbox-vs-live; we never send a scope.
  const runToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      let output: unknown;
      try {
        const res = await fetch("/api/portal/voice-agent/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            name,
            arguments: argsJson ? JSON.parse(argsJson) : {},
          }),
        });
        const body = await res.json().catch(() => ({}));
        output = res.ok
          ? body.result
          : { success: false, error: body.error ?? "Verktøyet feilet." };
      } catch {
        output = { success: false, error: "Fikk ikke kontakt med kalenderen." };
      }

      const dc = dcRef.current;
      if (!dc || dc.readyState !== "open") return;
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(output),
          },
        }),
      );
      // The model does not continue on its own after a tool result — it needs
      // an explicit nudge to speak the answer.
      dc.send(JSON.stringify({ type: "response.create" }));
    },
    [clientId],
  );

  const handleServerEvent = useCallback((ev: Record<string, unknown>) => {
    switch (ev.type) {
      // Tool calls are picked up from the completed output ITEM, not from
      // response.function_call_arguments.done. That event carries `name` and
      // `arguments` but not `call_id` — and without the right call_id the
      // function_call_output can't be matched back to the call, so the model
      // just stalls. The item has all three.
      case "response.output_item.done": {
        const item = ev.item as
          | { type?: string; call_id?: string; name?: string; arguments?: string }
          | undefined;
        if (item?.type === "function_call" && item.call_id && item.name) {
          void runToolCall(item.call_id, item.name, item.arguments ?? "{}");
        }
        break;
      }
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
      case "response.done": {
        const usage = (ev.response as { usage?: Record<string, unknown> } | undefined)?.usage;
        if (usage) {
          usageRef.current.inputTokens += Number(usage.input_tokens ?? 0);
          usageRef.current.outputTokens += Number(usage.output_tokens ?? 0);
          const cached = (usage.input_token_details as { cached_tokens?: number } | undefined)?.cached_tokens;
          usageRef.current.cacheReadInputTokens += Number(cached ?? 0);
        }
        break;
      }
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
  }, [runToolCall]);

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
        startedAtRef.current = Date.now();
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
          reportUsage();
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
  }, [cleanup, handleServerEvent, clientId, reportUsage]);

  const stop = useCallback(() => {
    reportUsage();
    cleanup();
    setUiState("idle");
    setAgentSpeaking(false);
  }, [cleanup, reportUsage]);

  const statusLabel =
    uiState === "connecting"
      ? "Kobler til…"
      : uiState === "active"
        ? agentSpeaking
          ? "Agenten snakker…"
          : "Lytter — si noe"
        : "Klar";

  if (unavailable) {
    return (
      <div className="vac vac-disabled">
        <style>{`
          .vac { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 14px; padding: 22px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
          .vac-disabled { background: #faf8f1; }
          .vac-orb.muted { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 24px; background: #efede2; opacity: .7; }
          .vac-body { flex: 1; min-width: 220px; }
          .vac-status.muted { font-family: var(--font-space-mono), monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; color: #9a9a8c; }
          .vac-msg { font-size: 13.5px; color: #5c5f52; margin-top: 4px; max-width: 52ch; }
          .vac-btn-disabled { padding: 10px 18px; border-radius: 10px; font-size: 14px; font-weight: 700; border: none; flex-shrink: 0; background: #efede2; color: #9a9a8c; cursor: not-allowed; }
        `}</style>
        <div className="vac-orb muted">📞</div>
        <div className="vac-body">
          <div className="vac-status muted">Ikke tilgjengelig ennå</div>
          <div className="vac-msg">Vi finpusser stemmeagenten din — den kommer snart hit.</div>
        </div>
        <button type="button" className="vac-btn-disabled" disabled>
          Snakk med agenten →
        </button>
      </div>
    );
  }

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
