// Watchdog that guarantees the voice agent never leaves the caller in
// silence after a committed turn.
//
// History, so nobody re-inlines this: the agent going mute after a user turn
// was "fixed" four times as inline React-ref logic, and each fix was a guess
// against state nobody could see — first it only covered tool-call nudges,
// then it keyed on response.status values that turned out to be wrong, then
// it keyed on caller-speech state but could burn its retry budget into a
// suppressed timeout that nothing ever re-armed. It also only ever reacted
// to response.done, so a turn where the server never *created* a response at
// all (semantic VAD holding back on a phone-number cadence, for instance)
// had nothing to react to.
//
// This class replaces all of that with one explicit contract:
//
//   After a committed caller turn (or after we post a tool result), the
//   agent MUST produce audible audio. Until it does, this watchdog owns the
//   cycle: a silent response.done triggers a nudge, and — critically — NO
//   response at all triggers a nudge at a deadline. Caller speech defers
//   nudges but never kills the cycle; the cycle only ends when audio
//   actually starts, or the nudge budget runs out.
//
// It is a pure state machine over Realtime server events, constructed with
// its send/log functions injected, so every scenario above is unit-tested
// in evals/lib/voiceDemo/replyWatchdog.eval.ts.

type ServerEvent = {
  type?: string;
  response?: {
    status?: string;
    status_details?: {
      type?: string;
      error?: { type?: string; code?: string; message?: string };
    };
    output?: OutputItem[];
  };
  error?: unknown;
};

/**
 * Rate-limit errors state exactly when to come back: "Please try again in
 * 6.232s" / "in 174ms". Parse that, because nudging any sooner is a
 * guaranteed failure — a live call burned its entire 5-nudge budget in 3.4
 * seconds against a 6-second throttle window, every attempt refused.
 */
export function parseRetryAfterMs(message: string | undefined): number | null {
  const m = /try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(message ?? "");
  if (!m) return null;
  const value = Number(m[1]);
  return m[2].toLowerCase() === "ms" ? Math.round(value) : Math.round(value * 1000);
}

type OutputItem = {
  type?: string;
  content?: { type?: string }[];
};

export type WatchdogLogger = (note: string, detail?: Record<string, unknown>) => void;

export type ReplyWatchdogOptions = {
  /** Sends `response.create` over the data channel. */
  send: () => void;
  /** Surfaces every decision — this is the diagnosis trail. */
  log?: WatchdogLogger;
  /** Pause before a nudge, so we never race a reply that's about to appear. */
  nudgeDelayMs?: number;
  /** Max silence after a committed turn before we assume no reply is coming. */
  deadlineMs?: number;
  /** Nudge budget per caller turn. */
  maxNudges?: number;
};

/** What a response actually contained — audio is the only thing the caller hears. */
export function classifyOutput(output: OutputItem[] | undefined): {
  hasAudio: boolean;
  hasText: boolean;
  hasFunctionCall: boolean;
  count: number;
} {
  let hasAudio = false;
  let hasText = false;
  let hasFunctionCall = false;
  for (const item of output ?? []) {
    if (item.type === "function_call") hasFunctionCall = true;
    for (const c of item.content ?? []) {
      // GA names + older names, so a server-side rename can't blind us.
      if (c.type === "output_audio" || c.type === "audio") hasAudio = true;
      if (c.type === "output_text" || c.type === "text") hasText = true;
    }
  }
  return { hasAudio, hasText, hasFunctionCall, count: output?.length ?? 0 };
}

export class ReplyWatchdog {
  private readonly send: () => void;
  private readonly log: WatchdogLogger;
  private readonly nudgeDelayMs: number;
  private readonly deadlineMs: number;
  private readonly maxNudges: number;

  private awaiting = false;
  private userSpeaking = false;
  private activeResponse = false;
  private sawAudioThisResponse = false;
  private nudgesUsed = 0;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(opts: ReplyWatchdogOptions) {
    this.send = opts.send;
    this.log = opts.log ?? (() => {});
    this.nudgeDelayMs = opts.nudgeDelayMs ?? 400;
    this.deadlineMs = opts.deadlineMs ?? 3000;
    this.maxNudges = opts.maxNudges ?? 5;
  }

  /** Call right after the app itself sends response.create (greeting, tool result). */
  expectReply(): void {
    this.arm("local response.create");
  }

  handle(ev: ServerEvent): void {
    if (this.disposed) return;
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        this.userSpeaking = true;
        // Never nudge into the caller's speech. Their commit re-arms us, so
        // deferring here can't strand the cycle.
        this.clearNudge();
        this.clearDeadline();
        break;

      case "input_audio_buffer.speech_stopped":
        this.userSpeaking = false;
        // Speech that never commits (a cough, an echo blip) must not strand
        // an open cycle — restart the deadline so silence still gets caught.
        if (this.awaiting && !this.activeResponse) this.startDeadline();
        break;

      case "input_audio_buffer.committed":
        this.arm("caller turn committed");
        break;

      case "response.created":
        this.activeResponse = true;
        this.sawAudioThisResponse = false;
        // A response is in flight; response.done takes over from the deadline.
        this.clearDeadline();
        break;

      case "output_audio_buffer.started":
        // Audio is actually reaching the caller — the cycle succeeded, even
        // if a barge-in cancels the response a moment later.
        this.sawAudioThisResponse = true;
        this.settle("agent audio started");
        break;

      case "response.done": {
        this.activeResponse = false;
        const cls = classifyOutput(ev.response?.output);
        if (cls.hasAudio || this.sawAudioThisResponse) {
          this.settle("response produced audio");
          break;
        }
        if (cls.hasFunctionCall) {
          // Tool round-trip in flight; expectReply() re-arms when the app
          // posts the result. Deadline stays as the safety net in case the
          // relay dies.
          this.log("function_call turn — awaiting tool round-trip");
          this.startDeadline();
          break;
        }
        if (!this.awaiting) {
          this.log("silent response outside a cycle — ignoring", { status: ev.response?.status });
          break;
        }
        // The caller heard nothing. Status is deliberately irrelevant to
        // WHETHER we retry — guessing at status values is how earlier fixes
        // missed real failures — but the failure detail decides WHEN:
        // a rate-limit error names its own retry window, and nudging inside
        // it is a guaranteed refusal.
        const err = ev.response?.status_details?.error;
        this.log(
          cls.hasText
            ? "TEXT-ONLY response — caller heard nothing"
            : "SILENT response — zero audible output",
          {
            status: ev.response?.status,
            outputCount: cls.count,
            ...(err ? { errorCode: err.code, errorMessage: err.message?.slice(0, 160) } : {}),
          },
        );
        if (err?.code === "rate_limit_exceeded") {
          const retryAfter = parseRetryAfterMs(err.message);
          if (retryAfter !== null) {
            // Server-stated window + a little headroom for the bucket to
            // actually free enough; clamped so a weird message can't stall
            // us forever.
            const delay = Math.min(Math.max(retryAfter + 500, 750), 20000);
            this.log(`rate-limited — honoring server retry-after (${delay}ms)`);
            this.scheduleNudge(delay);
            break;
          }
        }
        this.scheduleNudge();
        break;
      }

      case "error":
        // e.g. "conversation already has an active response" from our own
        // nudge — must be visible, and the deadline keeps the cycle alive.
        this.log("server error event", { error: ev.error });
        if (this.awaiting && !this.activeResponse) this.startDeadline();
        break;
    }
  }

  reset(): void {
    this.settle("reset");
    this.userSpeaking = false;
    this.activeResponse = false;
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.clearNudge();
    this.clearDeadline();
    this.awaiting = false;
  }

  private arm(reason: string): void {
    this.awaiting = true;
    this.nudgesUsed = 0;
    this.log("armed — agent must now produce audio", { reason });
    this.startDeadline();
  }

  private settle(reason: string): void {
    if (this.awaiting) this.log("settled", { reason });
    this.awaiting = false;
    this.nudgesUsed = 0;
    this.clearNudge();
    this.clearDeadline();
  }

  private scheduleNudge(delayMs?: number): void {
    if (this.nudgesUsed >= this.maxNudges) {
      this.log("nudge budget exhausted — giving up on this turn");
      return;
    }
    this.clearNudge();
    // Unless the server dictated a window (rate limits), back off
    // exponentially: 400ms, 800, 1600, 3200, 3200 — repeated instant
    // retries against a struggling server just waste the budget.
    const delay =
      delayMs ?? this.nudgeDelayMs * 2 ** Math.min(this.nudgesUsed, 3);
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      if (this.disposed) return;
      if (this.userSpeaking) {
        // Defer, don't die: the caller's commit re-arms with a fresh budget,
        // and if their speech never commits, speech_stopped restarts the
        // deadline. Either way the cycle survives — this exact
        // suppressed-and-lost race silenced a live call once.
        this.log("nudge deferred — caller is speaking");
        return;
      }
      if (this.activeResponse) {
        this.log("nudge skipped — a response is already active");
        this.startDeadline();
        return;
      }
      if (this.nudgesUsed >= this.maxNudges) {
        this.log("nudge budget exhausted — giving up on this turn");
        return;
      }
      // Budget burns only on an actual send. A nudge that was scheduled but
      // then deferred, skipped, or cancelled must not count — otherwise a
      // busy call quietly loses its rescue attempts without ever rescuing.
      this.nudgesUsed += 1;
      this.log(`nudge ${this.nudgesUsed}/${this.maxNudges} — sending response.create`);
      this.send();
      this.startDeadline();
    }, delay);
  }

  private startDeadline(): void {
    this.clearDeadline();
    this.deadlineTimer = setTimeout(() => {
      this.deadlineTimer = null;
      if (this.disposed || !this.awaiting) return;
      if (this.userSpeaking) return; // speech_stopped restarts us
      if (this.activeResponse) {
        // Still generating (a long reply, or a stuck one) — keep watching.
        this.startDeadline();
        return;
      }
      // The hole every earlier fix had: nothing arrived to react to. A turn
      // was committed, no response ever materialized (or its nudge got
      // deferred) — force one.
      this.log("deadline hit — no audible reply materialized; nudging");
      this.scheduleNudge();
    }, this.deadlineMs);
  }

  private clearNudge(): void {
    if (this.nudgeTimer) {
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = null;
    }
  }

  private clearDeadline(): void {
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }
}
