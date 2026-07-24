import WebSocket from "ws";
import { ReplyWatchdog } from "@/lib/voiceDemo/replyWatchdog";
import { execBookingTool } from "@/lib/bookingTools";
import type { BookingScope } from "@/lib/slots";

// Server-side runner for ONE inbound phone call, once OpenAI has accepted the
// SIP call. Re-hosts the browser agent's reliability logic (ReplyWatchdog,
// shared booking tools, graceful finish_session hangup) over the call's
// Realtime control channel.
//
// DIAGNOSTIC BUILD: every server event and every control message we send is
// traced to the log, so a single real test call reveals exactly why the
// greeting truncates (echo? line noise? a competing response? a server
// failure?) instead of us guessing. High-frequency audio/transcript deltas
// are skipped so the trace stays readable.
//
// Host-agnostic: it's an awaitable that lives for the call. On Vercel it runs
// inside Next's after().

type Logger = (note: string, detail?: Record<string, unknown>) => void;

export type CallUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
};

export type CallSummary = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  usage: CallUsage;
};

const GRACE_MS = 5000;
const HANGUP_SAFETY_MS = 12_000;
const MAX_HANGUP_RECOVERIES = 3;

// Event types that fire many times per second — logging them would drown the
// trace. Everything else is logged.
const NOISY = new Set([
  "response.output_audio.delta",
  "response.output_audio_transcript.delta",
  "response.audio.delta",
  "response.audio_transcript.delta",
  "response.function_call_arguments.delta",
  "output_audio_buffer.append",
  "rate_limits.updated",
]);

export type RunCallOptions = {
  callId: string;
  apiKey: string;
  clientId: string;
  scope: BookingScope;
  withTools: boolean;
  log?: Logger;
  onComplete?: (summary: CallSummary) => void;
  wsFactory?: (url: string, apiKey: string) => WebSocket;
};

function defaultWsFactory(url: string, apiKey: string): WebSocket {
  return new WebSocket(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" },
  });
}

export function runCallSession(opts: RunCallOptions): Promise<void> {
  const { callId, apiKey, clientId, scope, withTools } = opts;
  const log: Logger = opts.log ?? (() => {});
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
  const ws = (opts.wsFactory ?? defaultWsFactory)(url, apiKey);

  return new Promise<void>((resolve) => {
    let settled = false;
    let startedAt = 0;
    const usage: CallUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };

    const finish = () => {
      if (settled) return;
      settled = true;
      watchdog.dispose();
      clearHangupTimer();
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      if (startedAt && opts.onComplete) {
        const endedAt = Date.now();
        try {
          opts.onComplete({
            startedAt,
            endedAt,
            durationSeconds: Math.max(0, (endedAt - startedAt) / 1000),
            usage,
          });
        } catch {
          /* best-effort */
        }
      }
      resolve();
    };

    // Trace + send every control message so the log shows exactly what we do.
    const send = (obj: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(obj));
      log(`OUT ${(obj as { type?: string }).type ?? "?"}`);
    };

    const watchdog = new ReplyWatchdog({
      send: () => send({ type: "response.create" }),
      log: (note, detail) => log(`watchdog: ${note}`, detail),
    });

    const hangup = async () => {
      try {
        await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch (e) {
        log("hangup request failed", { error: String(e) });
      }
      finish();
    };

    // --- finish_session shutdown state (mirrors the browser agent) ---
    let hangupPending = false;
    let hangupCallId: string | null = null;
    let hangupRecoveries = 0;
    let hangupTimer: NodeJS.Timeout | null = null;
    const clearHangupTimer = () => {
      if (hangupTimer) {
        clearTimeout(hangupTimer);
        hangupTimer = null;
      }
    };
    const cancelHangup = () => {
      if (!hangupPending) return;
      hangupPending = false;
      clearHangupTimer();
      const cid = hangupCallId;
      hangupCallId = null;
      if (cid) {
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: cid,
            output: JSON.stringify({
              success: false,
              reason:
                "Kunden fortsatte samtalen, så det ble ikke lagt på. Svar kunden, og kall finish_session på nytt i samme replikk som din neste avslutning.",
            }),
          },
        });
      }
    };

    ws.on("open", () => {
      startedAt = Date.now();
      log("call ws open", { callId });
      // Baseline: greet immediately, exactly like the browser does. No VAD
      // tricks, no settle window — we're diagnosing, not patching.
      send({ type: "response.create" });
      watchdog.expectReply();
    });

    // Diagnostic trace of every inbound event (minus the noisy deltas), with
    // the fields that tell us WHY the greeting cuts: response.done status
    // (cancelled = truncated), what the agent "heard" (echo of its own voice?
    // line noise? real speech?), what it "said", and any error.
    const traceIn = (ev: Record<string, unknown>) => {
      const t = String(ev.type ?? "?");
      if (NOISY.has(t)) return;
      const r = ev.response as
        | { status?: string; status_details?: unknown; output?: Array<{ type?: string; name?: string }> }
        | undefined;
      const detail: Record<string, unknown> = {};
      if (t === "response.done" || t === "response.created") {
        if (r?.status) detail.status = r.status;
        if (r?.status_details) detail.statusDetails = r.status_details;
        if (r?.output?.length) detail.output = r.output.map((i) => i.type + (i.name ? `:${i.name}` : ""));
      }
      if (t === "conversation.item.input_audio_transcription.completed") {
        detail.heard = String(ev.transcript ?? "").slice(0, 140);
      }
      if (t === "response.output_audio_transcript.done") {
        detail.said = String(ev.transcript ?? "").slice(0, 140);
      }
      if (t === "error") detail.error = ev.error;
      log(`IN ${t}`, Object.keys(detail).length ? detail : undefined);
    };

    ws.on("message", (raw: WebSocket.RawData) => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(raw.toString());
      } catch {
        return;
      }
      traceIn(ev);
      watchdog.handle(ev as never);

      switch (ev.type) {
        case "response.output_item.done": {
          const item = ev.item as
            | { type?: string; call_id?: string; name?: string; arguments?: string }
            | undefined;
          if (item?.type !== "function_call" || !item.call_id || !item.name) break;

          if (item.name === "finish_session") {
            hangupPending = true;
            hangupCallId = item.call_id;
            clearHangupTimer();
            hangupTimer = setTimeout(() => void hangup(), HANGUP_SAFETY_MS);
            break;
          }
          void (async () => {
            let output: unknown;
            try {
              const args = item.arguments ? JSON.parse(item.arguments) : {};
              output = await execBookingTool(clientId, item.name!, args, scope);
            } catch (e) {
              output = { success: false, error: "Teknisk feil mot kalenderen." };
              log("tool exec threw", { name: item.name, error: String(e) });
            }
            send({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(output) },
            });
            send({ type: "response.create" });
            watchdog.expectReply();
            log("tool executed", { name: item.name });
          })();
          break;
        }

        case "response.done": {
          const response = ev.response as
            | {
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  input_token_details?: { cached_tokens?: number };
                };
                output?: Array<{ type?: string; name?: string; content?: Array<{ type?: string }> }>;
              }
            | undefined;
          if (response?.usage) {
            usage.inputTokens += response.usage.input_tokens ?? 0;
            usage.outputTokens += response.usage.output_tokens ?? 0;
            usage.cacheReadInputTokens += response.usage.input_token_details?.cached_tokens ?? 0;
          }
          const output = response?.output ?? [];
          const hasAudio = output.some(
            (i) => i.type === "message" && i.content?.some((c) => c.type === "output_audio"),
          );
          const calledFinish = output.some(
            (i) => i.type === "function_call" && i.name === "finish_session",
          );
          if (hangupPending && calledFinish && !hasAudio && hangupRecoveries < MAX_HANGUP_RECOVERIES && hangupCallId) {
            hangupRecoveries += 1;
            send({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: hangupCallId,
                output: JSON.stringify({
                  success: true,
                  note: "Opphenget er klart og skjer automatisk når avslutningsreplikken din er ferdig spilt. Si avslutningsreplikken NÅ, og ikke kall finish_session på nytt.",
                }),
              },
            });
            send({ type: "response.create" });
            watchdog.expectReply();
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          cancelHangup();
          break;

        case "output_audio_buffer.started":
          if (hangupPending) {
            clearHangupTimer();
            hangupTimer = setTimeout(() => void hangup(), 60_000);
          }
          break;

        case "output_audio_buffer.stopped":
          if (hangupPending) {
            clearHangupTimer();
            hangupTimer = setTimeout(() => void hangup(), GRACE_MS);
          }
          break;
      }
    });

    ws.on("close", () => {
      log("call ws closed", { callId });
      finish();
    });
    ws.on("error", (e: Error) => {
      log("call ws error", { error: String(e) });
      finish();
    });

    setTimeout(finish, 15 * 60 * 1000);
    void withTools;
  });
}
