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
