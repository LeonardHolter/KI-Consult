import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyWatchdog, classifyOutput, parseRetryAfterMs } from "@/lib/voiceDemo/replyWatchdog";

// Each test here maps to a real way the live voice agent went silent (or
// could have). The inline predecessors of this watchdog were patched four
// times against live calls; every one of those incidents is pinned down
// below so it can never quietly return.

const NUDGE_MS = 400;
const DEADLINE_MS = 3000;
const MAX_NUDGES = 5;

function makeDog() {
  const sends: string[] = [];
  const logs: string[] = [];
  const dog = new ReplyWatchdog({
    send: () => sends.push("response.create"),
    log: (note) => logs.push(note),
    nudgeDelayMs: NUDGE_MS,
    deadlineMs: DEADLINE_MS,
    maxNudges: MAX_NUDGES,
  });
  return { dog, sends, logs };
}

const commit = { type: "input_audio_buffer.committed" };
const created = { type: "response.created" };
const speechStart = { type: "input_audio_buffer.speech_started" };
const speechStop = { type: "input_audio_buffer.speech_stopped" };
const audioStarted = { type: "output_audio_buffer.started" };

const doneEmpty = (status = "completed") => ({
  type: "response.done",
  response: { status, output: [] },
});
const doneAudio = {
  type: "response.done",
  response: {
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_audio" }] }],
  },
};
const doneTextOnly = {
  type: "response.done",
  response: {
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text" }] }],
  },
};
const doneFunctionCall = {
  type: "response.done",
  response: {
    status: "completed",
    output: [{ type: "function_call", name: "get_available_demo_slots" }],
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// The exact failure a live call finally caught on tape: the org's 40k TPM
// limit for gpt-realtime, every response request ~8.5k tokens, so responses
// come back status=failed with a stated retry window. The old fixed-delay
// nudges burned the whole budget inside that window — 5 refusals in 3.4s
// against "try again in 6.2s".
const doneRateLimited = (retryIn: string) => ({
  type: "response.done",
  response: {
    status: "failed",
    status_details: {
      type: "failed",
      error: {
        type: "tokens",
        code: "rate_limit_exceeded",
        message: `Rate limit reached for gpt-realtime on tokens per min (TPM): Limit 40000, Requested 8571. Please try again in ${retryIn}. Visit https://platform.openai.com/account/rate-limits to learn more.`,
      },
    },
    output: [],
  },
});

describe("parseRetryAfterMs", () => {
  it("parses seconds and milliseconds forms", () => {
    expect(parseRetryAfterMs("Please try again in 6.232s. Visit ...")).toBe(6232);
    expect(parseRetryAfterMs("Please try again in 174ms. Visit ...")).toBe(174);
    expect(parseRetryAfterMs("Please try again in 13ms.")).toBe(13);
  });
  it("returns null when no window is stated", () => {
    expect(parseRetryAfterMs("The server had an error")).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });
});

describe("classifyOutput", () => {
  it("distinguishes audio, text-only, and function_call outputs", () => {
    expect(classifyOutput(doneAudio.response.output)).toMatchObject({ hasAudio: true });
    expect(classifyOutput(doneTextOnly.response.output)).toMatchObject({
      hasAudio: false,
      hasText: true,
    });
    expect(classifyOutput(doneFunctionCall.response.output)).toMatchObject({
      hasFunctionCall: true,
    });
    expect(classifyOutput([])).toMatchObject({ count: 0 });
  });
});

describe("ReplyWatchdog", () => {
  it("nudges after a silent completed response (live incident #1)", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    expect(sends).toHaveLength(0);
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("nudges after a silent CANCELLED response — status is irrelevant (live incident #4)", () => {
    // The last inline fix gated on status === "completed" and the one before
    // skipped "cancelled"; a real silent turn matched neither guess. The
    // watchdog must not care what the server called it.
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty("cancelled"));
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("nudges at the deadline when NO response is ever created (semantic-VAD hold)", () => {
    // The blind spot every inline fix shared: they only reacted to
    // response.done. A committed turn with no response at all left nothing
    // to react to.
    const { dog, sends } = makeDog();
    dog.handle(commit);
    vi.advanceTimersByTime(DEADLINE_MS - 1);
    expect(sends).toHaveLength(0);
    vi.advanceTimersByTime(1 + NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("treats a TEXT-ONLY response as silence and nudges (modality fallout)", () => {
    const { dog, sends, logs } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneTextOnly);
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
    expect(logs.some((l) => l.includes("TEXT-ONLY"))).toBe(true);
  });

  it("stays quiet when the response produced audio", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(audioStarted);
    dog.handle(doneAudio);
    vi.advanceTimersByTime(DEADLINE_MS * 3);
    expect(sends).toHaveLength(0);
  });

  it("settles on output_audio_buffer.started even if the response is later cancelled by barge-in", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(audioStarted);
    // Caller interrupts; response ends cancelled with no audio in its final
    // output payload — but the caller already heard the beginning.
    dog.handle(doneEmpty("cancelled"));
    vi.advanceTimersByTime(DEADLINE_MS * 3);
    expect(sends).toHaveLength(0);
  });

  it("defers a nudge while the caller speaks, and the cycle survives (suppressed-retry race)", () => {
    // Live incident: retry was suppressed because speech_started landed in
    // the delay window, and nothing ever re-armed it. Here the caller's
    // speech never even commits (an echo blip) — the deadline must still
    // rescue the cycle.
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    vi.advanceTimersByTime(NUDGE_MS - 100);
    dog.handle(speechStart);
    vi.advanceTimersByTime(200); // nudge timer fires here — must defer, not send
    expect(sends).toHaveLength(0);
    dog.handle(speechStop); // blip over, no commit
    vi.advanceTimersByTime(DEADLINE_MS + NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("a fresh caller commit re-arms with a fresh nudge budget", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
    // Caller speaks again before anything else happens.
    dog.handle(speechStart);
    dog.handle(speechStop);
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(2);
  });

  it("does not nudge a function_call turn, but re-arms via expectReply for the tool result", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneFunctionCall);
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(0); // tool round-trip owns this gap
    dog.expectReply(); // app posted function_call_output + response.create
    dog.handle(created);
    dog.handle(doneEmpty()); // the post-tool reply came back silent (live incident #2)
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("exhausts the nudge budget and stops, rather than looping forever", () => {
    const { dog, sends, logs } = makeDog();
    dog.handle(commit);
    for (let i = 0; i < MAX_NUDGES + 3; i++) {
      dog.handle(created);
      dog.handle(doneEmpty());
      vi.advanceTimersByTime(NUDGE_MS + DEADLINE_MS);
    }
    expect(sends).toHaveLength(MAX_NUDGES);
    expect(logs.some((l) => l.includes("budget exhausted"))).toBe(true);
  });

  it("skips the send when a response is already active, then recovers via deadline", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    // Another response starts (server auto-created one) before our nudge fires.
    dog.handle(created);
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(0); // must not double-create
    dog.handle(doneEmpty()); // and it was silent too
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(1);
  });

  it("honors the server's retry-after window when rate-limited (live incident #5)", () => {
    const { dog, sends, logs } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneRateLimited("6.232s"));
    // The old behavior — nudging at 400ms — was a guaranteed refusal.
    vi.advanceTimersByTime(NUDGE_MS);
    expect(sends).toHaveLength(0);
    vi.advanceTimersByTime(6232 + 500 - NUDGE_MS - 1);
    expect(sends).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sends).toHaveLength(1);
    expect(logs.some((l) => l.includes("rate-limited"))).toBe(true);
  });

  it("clamps an absurd or tiny stated retry window to sane bounds", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneRateLimited("13ms")); // floor: never sooner than 750ms
    vi.advanceTimersByTime(749);
    expect(sends).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sends).toHaveLength(1);
  });

  it("backs off exponentially on repeated generic silent turns", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    vi.advanceTimersByTime(NUDGE_MS); // nudge 1 at 400ms
    expect(sends).toHaveLength(1);
    dog.handle(created);
    dog.handle(doneEmpty());
    vi.advanceTimersByTime(NUDGE_MS); // 400ms is no longer enough...
    expect(sends).toHaveLength(1);
    vi.advanceTimersByTime(NUDGE_MS); // ...nudge 2 lands at 800ms
    expect(sends).toHaveLength(2);
  });

  it("dispose() cancels all pending timers", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created);
    dog.handle(doneEmpty());
    dog.dispose();
    vi.advanceTimersByTime(DEADLINE_MS * 3);
    expect(sends).toHaveLength(0);
  });

  it("keeps watching through a long generation instead of nudging into it", () => {
    const { dog, sends } = makeDog();
    dog.handle(commit);
    dog.handle(created); // response in flight, just slow
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(sends).toHaveLength(0); // never talk over an active generation
    dog.handle(audioStarted); // it eventually speaks
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(sends).toHaveLength(0);
  });
});
