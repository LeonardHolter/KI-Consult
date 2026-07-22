"use client";

import { useCallback, useRef, useState } from "react";
import { ReplyWatchdog } from "@/lib/voiceDemo/replyWatchdog";

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
  // Owns the "agent must never leave the caller in silence" contract. Four
  // inline predecessors of this were patched against live calls and each
  // still had a hole; the full history and every scenario live in
  // lib/voiceDemo/replyWatchdog.ts and its eval suite.
  const watchdogRef = useRef<ReplyWatchdog | null>(null);

  // Set when the model calls finish_session (it says the farewell and hangs
  // up in the same turn). The actual disconnect waits for
  // output_audio_buffer.stopped so the farewell finishes PLAYING first —
  // hanging up on the tool call itself would cut «Ha det bra!» mid-air,
  // deliberately recreating the dropped-tail bug this flow exists to avoid.
  const hangupPendingRef = useRef(false);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // call_id of the pending finish_session, so a cancelled hangup can report
  // back to the model that it must close again — without this the model
  // believes it already hung up and never re-calls the tool.
  const hangupCallIdRef = useRef<string | null>(null);

  // Call recording for the admin review panel: mic + agent audio are mixed
  // into one MediaRecorder track and posted to the recordings API when the
  // call ends. The WebRTC audio never touches our backend, so recording in
  // the browser is the only place the conversation can be captured at all.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordCtxRef = useRef<AudioContext | null>(null);
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordStartedAtRef = useRef<number>(0);

  // Stops the recorder and uploads what it captured. Fire-and-forget: a
  // failed upload must never break the hangup path the user is on.
  const stopRecordingAndUpload = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    const ctx = recordCtxRef.current;
    recordCtxRef.current = null;
    recordDestRef.current = null;
    if (!recorder) return;

    const startedAt = recordStartedAtRef.current;
    recordStartedAtRef.current = 0;
    const finish = () => {
      void ctx?.close().catch(() => {});
      const chunks = recordChunksRef.current;
      recordChunksRef.current = [];
      if (!startedAt || chunks.length === 0) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      // A call that never really started (a couple of KB of container
      // headers) isn't worth reviewing or storing.
      if (blob.size < 20 * 1024) return;
      const durationSeconds = (Date.now() - startedAt) / 1000;
      const params = new URLSearchParams({
        startedAt: new Date(startedAt).toISOString(),
        durationSeconds: String(durationSeconds),
      });
      if (clientId) params.set("clientId", clientId);
      fetch(`/api/portal/voice-agent/recordings?${params}`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      }).catch(() => {
        /* best-effort — the call itself already ended fine */
      });
    };

    if (recorder.state === "inactive") {
      finish();
    } else {
      recorder.onstop = finish;
      try {
        recorder.stop();
      } catch {
        finish();
      }
    }
  }, [clientId]);

  const cleanup = useCallback(() => {
    watchdogRef.current?.dispose();
    stopRecordingAndUpload();
    hangupPendingRef.current = false;
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
  }, [stopRecordingAndUpload]);

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
      // an explicit nudge to speak the answer. The watchdog owns what happens
      // if that nudge produces silence.
      dc.send(JSON.stringify({ type: "response.create" }));
      watchdogRef.current?.expectReply();
    },
    [clientId],
  );

  // The model hung up (finish_session): end the call the same way the stop
  // button does, once the farewell audio has drained.
  const completeHangup = useCallback(() => {
    if (!hangupPendingRef.current) return;
    hangupPendingRef.current = false;
    hangupCallIdRef.current = null;
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
      hangupTimerRef.current = null;
    }
    reportUsage();
    cleanup();
    setUiState("idle");
    setAgentSpeaking(false);
  }, [cleanup, reportUsage]);

  // The caller barged in on the farewell: the call is NOT over. Report the
  // aborted hangup back as the tool result — without this the model
  // believes it already hung up and never re-calls finish_session, leaving
  // the call dangling forever after a reciprocal "takk, i like måte".
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

  const handleServerEvent = useCallback((ev: Record<string, unknown>) => {
    // The watchdog sees every event, before any case can break early.
    watchdogRef.current?.handle(ev);
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
          if (item.name === "finish_session") {
            // Client-side tool: never relayed to the server executor. The
            // disconnect waits for output_audio_buffer.stopped so the
            // farewell finishes playing; a barge-in cancels instead (see
            // the cleared case). The watchdog stays alive until the hangup
            // actually lands, in case the call continues. Safety timer in
            // case neither stopped nor cleared ever arrives.
            hangupPendingRef.current = true;
            hangupCallIdRef.current = item.call_id;
            hangupTimerRef.current = setTimeout(completeHangup, 12000);
            break;
          }
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
        const response = ev.response as
          | { usage?: Record<string, unknown> }
          | undefined;
        const usage = response?.usage;
        if (usage) {
          usageRef.current.inputTokens += Number(usage.input_tokens ?? 0);
          usageRef.current.outputTokens += Number(usage.output_tokens ?? 0);
          const cached = (usage.input_token_details as { cached_tokens?: number } | undefined)?.cached_tokens;
          usageRef.current.cacheReadInputTokens += Number(cached ?? 0);
        }
        // Silence recovery lives in the ReplyWatchdog (fed above), which
        // also covers the case this handler structurally can't: a committed
        // caller turn where no response.done ever arrives.
        break;
      }
      case "output_audio_buffer.started":
        setAgentSpeaking(true);
        break;
      case "output_audio_buffer.stopped":
        setAgentSpeaking(false);
        // The farewell has finished playing — hang up after a 3s grace
        // window so the caller can still jump in and stop the shutdown.
        if (hangupPendingRef.current) {
          if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
          hangupTimerRef.current = setTimeout(completeHangup, 3000);
        }
        break;
      case "output_audio_buffer.cleared":
        setAgentSpeaking(false);
        // cleared = the caller interrupted the farewell — they have more to
        // say, so the call continues instead of hanging up on them.
        cancelHangup();
        break;
      case "input_audio_buffer.speech_started":
        // Caller speech during the shutdown sequence (farewell playing, or
        // the 3s grace window after it) aborts the hangup.
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
  }, [runToolCall, completeHangup, cancelHangup]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setLastMessage(null);
    assistantTextRef.current = "";
    setUiState("connecting");
    setAgentSpeaking(false);

    watchdogRef.current?.dispose();
    watchdogRef.current = new ReplyWatchdog({
      send: () => {
        const dc = dcRef.current;
        if (dc && dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      },
      // No event log on the dashboard card — the console is the trail here;
      // the tuner is the full diagnosis surface.
      log: (note, detail) => console.warn(`[voice-watchdog] ${note}`, detail ?? ""),
    });

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

      // Recording mix: both sides of the call feed one destination node,
      // whose stream the MediaRecorder captures. Safari has no webm/opus —
      // fall through to whatever container the browser can produce.
      try {
        const recCtx = new AudioContext();
        const recDest = recCtx.createMediaStreamDestination();
        recCtx.createMediaStreamSource(mic).connect(recDest);
        recordCtxRef.current = recCtx;
        recordDestRef.current = recDest;
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        const recorder = new MediaRecorder(recDest.stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 32000,
        });
        recordChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordChunksRef.current.push(e.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch {
        // No recording support — the call itself must still work.
      }

      let audioEl = audioRef.current;
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioRef.current = audioEl;
      }
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        // The agent's side of the recording mix.
        const recCtx = recordCtxRef.current;
        const recDest = recordDestRef.current;
        if (recCtx && recDest) {
          try {
            recCtx.createMediaStreamSource(e.streams[0]).connect(recDest);
          } catch {
            /* recording stays mic-only rather than failing the call */
          }
        }
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
        recordStartedAtRef.current = Date.now();
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
