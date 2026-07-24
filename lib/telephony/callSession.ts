import WebSocket from "ws";
import { ReplyWatchdog } from "@/lib/voiceDemo/replyWatchdog";
import { execBookingTool } from "@/lib/bookingTools";
import type { BookingScope } from "@/lib/slots";

// Server-side runner for ONE inbound phone call, once OpenAI has accepted the
// SIP call. It connects to the call's Realtime control channel and re-hosts,
// server-side, exactly the reliability logic the browser agent
// (VoiceAgentCard.tsx) proved out over dozens of live calls:
//   - greet first (a phone caller expects the receptionist to speak),
//   - ReplyWatchdog so the agent never leaves the caller in silence,
//   - booking tools executed via the shared execBookingTool (same code the
//     dashboard agent uses — sandbox/live decided by the caller's settings),
//   - graceful finish_session hangup that waits for the closing line to
//     finish, with a grace window a caller can interrupt, and the
//     bare-finish_session recovery (say-your-closing-now).
//
// Host-agnostic on purpose: it's just an awaitable that lives for the call.
// On Vercel it runs inside Next's `after()` (fine for a low-volume pilot on
// Fluid Compute); if call volume or length grows, the same function can be
// lifted verbatim into a small always-on worker. Nothing in here is
// Vercel-specific.

type Logger = (note: string, detail?: Record<string, unknown>) => void;

export type CallUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
};

export type CallSummary = {
  startedAt: number; // epoch ms of ws open
  endedAt: number;
  durationSeconds: number;
  usage: CallUsage;
};

const GRACE_MS = 5000; // caller can still speak in this window after the close
const HANGUP_SAFETY_MS = 12_000; // if the closing audio never comes
const MAX_HANGUP_RECOVERIES = 3;

export type RunCallOptions = {
  callId: string;
  apiKey: string;
  clientId: string;
  scope: BookingScope;
  /** Attach the booking tools, or run a conversation-only agent. */
  withTools: boolean;
  log?: Logger;
  /** Called once when the call ends, with duration + token usage — the phone
   *  equivalent of the browser agent's reportUsage(). Best-effort. */
  onComplete?: (summary: CallSummary) => void;
  /** Overridable for tests. */
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
      // Report duration + usage so phone calls land in the same voice_usage
      // table (and admin cost/graphs) as the dashboard agent.
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
          /* best-effort — the call already ended */
        }
      }
      resolve();
    };

    const send = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    };

    const watchdog = new ReplyWatchdog({
      send: () => send({ type: "response.create" }),
      log: (note, detail) => log(`watchdog: ${note}`, detail),
    });

    // Hang up the SIP leg. Closing the WS alone doesn't drop the phone call;
    // OpenAI's hangup endpoint does.
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
      // Tell the model it did NOT hang up, so it re-closes instead of going
      // silent after a reciprocal "ha det".
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
      // Greet first — the caller expects the receptionist to speak.
      send({ type: "response.create" });
      watchdog.expectReply();
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(raw.toString());
      } catch {
        return;
      }
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
          // Booking tools — executed by the SAME shared code the dashboard
          // agent uses; scope (sandbox/live) decided server-side from settings.
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
          // Bare finish_session (tool call, no closing spoken): answer it with
          // say-your-closing-now so the model doesn't improvise confusion.
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
          // Caller spoke during the shutdown sequence — call continues.
          cancelHangup();
          break;

        case "output_audio_buffer.started":
          // Closing audio is playing; swap the "audio never came" timer for a
          // generous stuck-stream fallback so it can't cut the sentence.
          if (hangupPending) {
            clearHangupTimer();
            hangupTimer = setTimeout(() => void hangup(), 60_000);
          }
          break;

        case "output_audio_buffer.stopped":
          // Closing finished playing — hang up after the grace window the
          // closing line promises the caller.
          if (hangupPending) {
            clearHangupTimer();
            hangupTimer = setTimeout(() => void hangup(), GRACE_MS);
          }
          break;

        case "error":
          log("realtime error", { error: ev.error });
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

    // Absolute ceiling: no phone call runs longer than this. Protects the
    // host from a wedged connection that never emits close.
    setTimeout(finish, 15 * 60 * 1000);

    // Keep the type checker aware withTools is intentionally read by the
    // webhook (it decides the session config), not here.
    void withTools;
  });
}
