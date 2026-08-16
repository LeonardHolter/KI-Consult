import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type WsType from "ws";

// Drives runCallSession with a fake WebSocket to prove the server-side phone
// agent behaves like the browser agent: greets first, routes booking tool
// calls through execBookingTool, and runs the finish_session hangup dance
// (wait for the closing audio, grace window, caller-speech aborts).

const { execBookingTool } = vi.hoisted(() => ({
  execBookingTool: vi.fn(async () => ({ success: true, slot: { id: "x" } })),
}));
vi.mock("@/lib/bookingTools", () => ({ execBookingTool }));

type Handler = (...args: unknown[]) => void;
class FakeWs {
  readyState = 1; // OPEN
  sent: string[] = [];
  private handlers: Record<string, Handler[]> = {};
  on(ev: string, cb: Handler) {
    (this.handlers[ev] ??= []).push(cb);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = 3;
  }
  emit(ev: string, ...args: unknown[]) {
    for (const cb of this.handlers[ev] ?? []) cb(...args);
  }
  get parsed() {
    return this.sent.map((s) => JSON.parse(s));
  }
  typesSent() {
    return this.parsed.map((m) => m.type);
  }
}

import { runCallSession } from "@/lib/telephony/callSession";

let fake: FakeWs;
function start() {
  fake = new FakeWs();
  void runCallSession({
    callId: "rtc_test",
    apiKey: "sk-test",
    clientId: "client-1",
    scope: "sandbox",
    withTools: true,
    wsFactory: () => fake as unknown as WsType,
  });
  fake.emit("open");
}

const funcCallDone = (name: string, args: string) => ({
  type: "response.output_item.done",
  item: { type: "function_call", call_id: "call_1", name, arguments: args },
});

beforeEach(() => {
  vi.useFakeTimers();
  execBookingTool.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runCallSession", () => {
  it("greets first — sends response.create on open", () => {
    start();
    expect(fake.typesSent()).toContain("response.create");
  });

  it("routes a booking tool call through execBookingTool and posts the result", async () => {
    start();
    fake.emit("message", JSON.stringify(funcCallDone("get_available_demo_slots", "{}")));
    await vi.runAllTimersAsync();

    expect(execBookingTool).toHaveBeenCalledWith("client-1", "get_available_demo_slots", {}, "sandbox");
    const out = fake.parsed.find(
      (m) => m.type === "conversation.item.create" && m.item?.type === "function_call_output",
    );
    expect(out.item.call_id).toBe("call_1");
    expect(JSON.parse(out.item.output)).toMatchObject({ success: true });
  });

  it("never sends finish_session to the booking executor", async () => {
    start();
    fake.emit("message", JSON.stringify(funcCallDone("finish_session", "{}")));
    await vi.runAllTimersAsync();
    // finish_session is a call-control tool; the executor must not see it.
    expect(execBookingTool).not.toHaveBeenCalled();
  });

  it("hangs up after the closing audio drains + grace window", async () => {
    start();
    fake.emit("message", JSON.stringify(funcCallDone("finish_session", "{}")));
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.started" }));
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.stopped" }));

    expect(fetch).not.toHaveBeenCalled(); // still in the 5s grace window
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/realtime/calls/rtc_test/hangup"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("caller speech in the grace window aborts the hangup and tells the model to re-close", async () => {
    start();
    fake.emit("message", JSON.stringify(funcCallDone("finish_session", "{}")));
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.stopped" }));
    fake.emit("message", JSON.stringify({ type: "input_audio_buffer.speech_started" }));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).not.toHaveBeenCalled(); // hangup was cancelled

    const reClose = fake.parsed.find(
      (m) =>
        m.type === "conversation.item.create" &&
        m.item?.type === "function_call_output" &&
        JSON.parse(m.item.output).success === false,
    );
    expect(JSON.parse(reClose.item.output).reason).toMatch(/fortsatte samtalen/i);
  });

  it("half-duplex gate: mutes for the greeting, re-listens after the echo tail, then stays disarmed", async () => {
    const td = { type: "server_vad", threshold: 0.65, interrupt_response: false };
    fake = new FakeWs();
    void runCallSession({
      callId: "rtc_test",
      apiKey: "sk-test",
      clientId: "client-1",
      scope: "sandbox",
      withTools: true,
      turnDetection: td,
      wsFactory: () => fake as unknown as WsType,
    });
    fake.emit("open");

    // On open (before the greeting) input is muted: turn_detection -> null.
    const muted = fake.parsed.find(
      (m) => m.type === "session.update" && m.session?.audio?.input?.turn_detection === null,
    );
    expect(muted).toBeTruthy();
    // EVERY session.update must carry session.type — without it the GA API
    // rejects the update (missing_required_parameter) and the gate silently
    // never engages. That exact bug shipped once; this keeps it caught.
    for (const m of fake.parsed.filter((x) => x.type === "session.update")) {
      expect(m.session.type).toBe("realtime");
    }

    // Agent finishes speaking -> after the echo tail, buffer cleared + VAD
    // restored to the original server_vad config.
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.stopped" }));
    await vi.advanceTimersByTimeAsync(700);
    expect(fake.typesSent()).toContain("input_audio_buffer.clear");
    const relistened = fake.parsed.find(
      (m) => m.type === "session.update" && m.session?.audio?.input?.turn_detection?.type === "server_vad",
    );
    expect(relistened).toBeTruthy();

    // EXPERIMENT: after the greeting the gate is disarmed — the agent speaking
    // again must NOT mute. Exactly one mute for the whole call; server_vad
    // alone guards the rest.
    const mutesBefore = fake.parsed.filter(
      (m) => m.type === "session.update" && m.session?.audio?.input?.turn_detection === null,
    ).length;
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.started" }));
    fake.emit("message", JSON.stringify({ type: "output_audio_buffer.stopped" }));
    await vi.advanceTimersByTimeAsync(700);
    const mutesAfter = fake.parsed.filter(
      (m) => m.type === "session.update" && m.session?.audio?.input?.turn_detection === null,
    ).length;
    expect(mutesBefore).toBe(1);
    expect(mutesAfter).toBe(1);
  });

  it("reports duration + accumulated token usage on completion", async () => {
    const onComplete = vi.fn();
    fake = new FakeWs();
    void runCallSession({
      callId: "rtc_test",
      apiKey: "sk-test",
      clientId: "client-1",
      scope: "sandbox",
      withTools: true,
      onComplete,
      wsFactory: () => fake as unknown as WsType,
    });
    fake.emit("open");
    fake.emit(
      "message",
      JSON.stringify({
        type: "response.done",
        response: {
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            input_token_details: { cached_tokens: 10, text_tokens: 85, audio_tokens: 15 },
            output_token_details: { audio_tokens: 30 },
          },
          output: [{ type: "message", content: [{ type: "output_audio" }] }],
        },
      }),
    );
    fake.emit("close");

    expect(onComplete).toHaveBeenCalledTimes(1);
    const s = onComplete.mock.calls[0][0];
    expect(s.usage).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadInputTokens: 10,
      // The text/audio split rides along from the same usage event — it is
      // what lets the admin cost view price the call exactly (migration 008).
      textInputTokens: 85,
      audioInputTokens: 15,
      audioOutputTokens: 30,
    });
    expect(s.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("answers a bare finish_session (no closing spoken) with say-your-closing-now", async () => {
    start();
    fake.emit("message", JSON.stringify(funcCallDone("finish_session", "{}")));
    // response.done arrives with the function_call but NO audio output.
    fake.emit(
      "message",
      JSON.stringify({
        type: "response.done",
        response: { output: [{ type: "function_call", name: "finish_session" }] },
      }),
    );
    await vi.runAllTimersAsync();

    const nudge = fake.parsed.find(
      (m) =>
        m.item?.type === "function_call_output" &&
        JSON.parse(m.item.output).note?.includes("Si avslutningsreplikken NÅ"),
    );
    expect(nudge).toBeTruthy();
  });
});
