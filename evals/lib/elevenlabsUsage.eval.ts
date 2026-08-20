import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The bridge that keeps the calls/minutes KPI alive after a client moves to
// ElevenLabs: their calls never touch our servers, so voice_usage — which the
// OpenAI paths write themselves — would silently stop growing and the tiles
// would quietly report zero. What matters here: it never double-counts, it
// never throws into the KPI read, and it never touches a non-pilot client.

const { insert, selectRows } = vi.hoisted(() => ({
  // The write goes through upsert(...) with ignoreDuplicates; the unique
  // index in supabase/009 is what actually settles a concurrent race.
  insert: vi.fn(async (_rows: Record<string, unknown>[], _opts?: unknown) => ({ error: null })),
  selectRows: vi.fn(async () => ({ data: [] as { started_at: string }[] })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: insert,
      select: () => ({ eq: () => ({ gte: selectRows }) }),
    }),
  }),
}));

import { syncElevenLabsVoiceUsage } from "@/lib/voiceDemo/elevenlabsUsage";

/** Handz On — the real pilot id, since the map is hardcoded. */
const PILOT = "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const NON_PILOT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125"; // Namsos, still OpenAI

/** 2026-08-20T10:00:00Z */
const START = 1787306400;

const conversation = (over: Partial<Record<string, unknown>> = {}) => ({
  conversation_id: "conv_1",
  start_time_unix_secs: START,
  call_duration_secs: 120,
  status: "done",
  ...over,
});

const respondWith = (conversations: unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ conversations }), { status: 200 }));

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "sk-test";
  insert.mockClear();
  insert.mockResolvedValue({ error: null });
  selectRows.mockClear();
  selectRows.mockResolvedValue({ data: [] });
});

afterEach(() => vi.unstubAllGlobals());

describe("ElevenLabs voice-usage sync", () => {
  it("inserts one row per completed call, with duration and end time derived", async () => {
    vi.stubGlobal("fetch", respondWith([conversation()]));
    await syncElevenLabsVoiceUsage(PILOT);

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      client_id: PILOT,
      started_at: new Date(START * 1000).toISOString(),
      ended_at: new Date((START + 120) * 1000).toISOString(),
      duration_seconds: 120,
    });
  });

  // The dedupe contract: voice_usage has no external-id column, so a
  // conversation is identified by its second-exact start time. Without this
  // every KPI read would re-insert every call and the tiles would inflate.
  it("skips calls already in voice_usage, matching on the start timestamp", async () => {
    selectRows.mockResolvedValue({ data: [{ started_at: new Date(START * 1000).toISOString() }] });
    vi.stubGlobal(
      "fetch",
      respondWith([
        conversation(),
        conversation({ conversation_id: "conv_2", start_time_unix_secs: START + 600 }),
      ]),
    );
    await syncElevenLabsVoiceUsage(PILOT);

    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].started_at).toBe(new Date((START + 600) * 1000).toISOString());
  });

  it("inserts nothing when every call is already recorded", async () => {
    selectRows.mockResolvedValue({ data: [{ started_at: new Date(START * 1000).toISOString() }] });
    vi.stubGlobal("fetch", respondWith([conversation()]));
    await syncElevenLabsVoiceUsage(PILOT);
    expect(insert).not.toHaveBeenCalled();
  });

  // A call still ringing, or one that failed before audio, is not usage —
  // counting it would put phantom calls on the client's dashboard.
  it("ignores calls that are unfinished or have no duration", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith([
        conversation({ status: "in-progress" }),
        conversation({ conversation_id: "c3", start_time_unix_secs: START + 60, call_duration_secs: 0 }),
        conversation({ conversation_id: "c4", start_time_unix_secs: START + 120, call_duration_secs: null }),
      ]),
    );
    await syncElevenLabsVoiceUsage(PILOT);
    expect(insert).not.toHaveBeenCalled();
  });

  it("never touches a client that is not on ElevenLabs — no API call at all", async () => {
    const fetchMock = respondWith([conversation()]);
    vi.stubGlobal("fetch", fetchMock);
    await syncElevenLabsVoiceUsage(NON_PILOT);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does nothing when no API key is configured", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = respondWith([conversation()]);
    vi.stubGlobal("fetch", fetchMock);
    await syncElevenLabsVoiceUsage(PILOT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The KPI tiles must render even when ElevenLabs is having a bad day: a
  // throwing sync here would take the whole dashboard down with it.
  it("swallows an ElevenLabs outage instead of breaking the KPI read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(syncElevenLabsVoiceUsage(PILOT)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it("swallows a non-200 from ElevenLabs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(syncElevenLabsVoiceUsage(PILOT)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  // The crash this file exists to prevent: syncElevenLabsVoiceUsage is
  // awaited in front of the WHOLE dashboard render (lib/kpi.ts), so an
  // unvalidated timestamp reaching new Date(NaN).toISOString() would 500 the
  // client's entire page — not merely the KPI tiles.
  it("ignores a conversation with a missing start time instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith([
        conversation({ start_time_unix_secs: undefined }),
        conversation({ conversation_id: "c9", start_time_unix_secs: null }),
      ]),
    );
    await expect(syncElevenLabsVoiceUsage(PILOT)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps the good calls when one row in the batch is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith([conversation({ start_time_unix_secs: undefined }), conversation({ conversation_id: "ok" })]),
    );
    await syncElevenLabsVoiceUsage(PILOT);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].started_at).toBe(new Date(START * 1000).toISOString());
  });

  it("writes with ignoreDuplicates so a concurrent dashboard cannot double-count", async () => {
    vi.stubGlobal("fetch", respondWith([conversation()]));
    await syncElevenLabsVoiceUsage(PILOT);
    expect(insert.mock.calls[0][1]).toMatchObject({
      onConflict: "client_id,started_at",
      ignoreDuplicates: true,
    });
  });

  it("does not throw when Supabase rejects the write, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { message: "duplicate key" } as never });
    vi.stubGlobal("fetch", respondWith([conversation()]));
    await expect(syncElevenLabsVoiceUsage(PILOT)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("survives a malformed conversation list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    await expect(syncElevenLabsVoiceUsage(PILOT)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
});
