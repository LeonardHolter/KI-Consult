import { beforeEach, describe, expect, it, vi } from "vitest";
import { eqArg, makeFakeSupabase } from "../../support/fakeSupabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getVoiceAgentPromptHistory,
  getVoiceAgentSettingsForClient,
  getVoiceDemoPromptHistory,
  getVoiceDemoSettingsAdmin,
  getVoiceDemoSettingsPublic,
  saveVoiceAgentSettings,
  saveVoiceDemoSettings,
} from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";

const ROW = {
  id: "default",
  model: "gpt-realtime-mini",
  voice: "cedar",
  speed: 0.9,
  turn_detection: { type: "server_vad", threshold: 0.4, prefix_padding_ms: 300, silence_duration_ms: 500, interrupt_response: false },
  noise_reduction: "far_field",
  transcription_model: "whisper-1",
  transcription_language: "no",
  instructions: "Saved instructions",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createServiceClient).mockReset();
});

describe("getVoiceDemoSettingsPublic (marketing demo, service-role, no auth)", () => {
  it("returns the saved row, mapped from snake_case to camelCase", async () => {
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: ROW }) });
    vi.mocked(createServiceClient).mockReturnValue(fake as never);

    const settings = await getVoiceDemoSettingsPublic();

    expect(settings).toMatchObject({
      model: "gpt-realtime-mini",
      voice: "cedar",
      speed: 0.9,
      turnDetection: ROW.turn_detection,
      noiseReduction: "far_field",
      transcriptionModel: "whisper-1",
      transcriptionLanguage: "no",
      instructions: "Saved instructions",
    });
  });

  it("queries by id = 'default', never by client_id", async () => {
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: ROW }) });
    vi.mocked(createServiceClient).mockReturnValue(fake as never);

    await getVoiceDemoSettingsPublic();

    expect(fake.calls).toHaveLength(1);
    expect(eqArg(fake.calls[0], "id")).toBe("default");
  });

  it("falls back to hardcoded defaults when the table/row is missing, instead of throwing", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: () => {
        throw new Error('relation "voice_demo_settings" does not exist');
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake as never);

    const settings = await getVoiceDemoSettingsPublic();

    expect(settings.model).toBe("gpt-realtime");
    expect(settings.instructions).toBe(DEFAULT_VOICE_DEMO_PROMPT);
  });

  it("falls back to defaults when the row simply doesn't exist yet (no row, no error)", async () => {
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: null }) });
    vi.mocked(createServiceClient).mockReturnValue(fake as never);

    const settings = await getVoiceDemoSettingsPublic();
    expect(settings.instructions).toBe(DEFAULT_VOICE_DEMO_PROMPT);
  });
});

describe("getVoiceDemoSettingsAdmin (marketing demo, session-scoped)", () => {
  it("returns null (not defaults) when unset, so the tuner can show its migration warning", async () => {
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: null }) });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    expect(await getVoiceDemoSettingsAdmin()).toBeNull();
  });
});

describe("getVoiceDemoPromptHistory (marketing demo)", () => {
  it("filters to client_id IS NULL, so a client's history never leaks into it", async () => {
    const fake = makeFakeSupabase({ voice_demo_prompt_history: () => ({ data: [] }) });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await getVoiceDemoPromptHistory();

    const isOp = fake.calls[0].ops.find((o) => o.method === "is");
    expect(isOp?.arg).toEqual(["client_id", null]);
  });
});

describe("saveVoiceDemoSettings", () => {
  it("snapshots the previous instructions into history only when they actually changed", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) =>
        call.ops.some((o) => o.method === "select") ? { data: { instructions: "old text" } } : { error: null },
      voice_demo_prompt_history: () => ({ error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await saveVoiceDemoSettings({
      model: "gpt-realtime",
      voice: "marin",
      speed: 1,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: "new text",
    });

    const historyInsert = fake.calls.find((c) => c.table === "voice_demo_prompt_history");
    expect(historyInsert).toBeDefined();
    const insertOp = historyInsert!.ops.find((o) => o.method === "insert");
    expect(insertOp?.arg).toMatchObject({ instructions: "old text" });
  });

  it("does NOT write a history row when instructions are unchanged (pure settings tweak)", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) =>
        call.ops.some((o) => o.method === "select") ? { data: { instructions: "same text" } } : { error: null },
      voice_demo_prompt_history: () => ({ error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await saveVoiceDemoSettings({
      model: "gpt-realtime-mini",
      voice: "marin",
      speed: 1,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: "same text",
    });

    expect(fake.calls.find((c) => c.table === "voice_demo_prompt_history")).toBeUndefined();
  });

  it("upserts with id = 'default' and surfaces the DB error to the caller", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) =>
        call.ops.some((o) => o.method === "select")
          ? { data: null }
          : { error: { message: "constraint violated" } },
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    const result = await saveVoiceDemoSettings({
      model: "gpt-realtime",
      voice: "marin",
      speed: 1,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: "x",
    });

    expect(result).toEqual({ error: "constraint violated" });
    const upsertCall = fake.calls.find((c) => c.ops.some((o) => o.method === "upsert"));
    const upsertArg = upsertCall!.ops.find((o) => o.method === "upsert")!.arg as Record<string, unknown>;
    expect(upsertArg.id).toBe("default");
  });
});

describe("getVoiceAgentSettingsForClient (per-client dashboard agent)", () => {
  it("queries by client_id, not by id", async () => {
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: ROW }) });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await getVoiceAgentSettingsForClient("client-123");

    expect(eqArg(fake.calls[0], "client_id")).toBe("client-123");
  });

  it("returns null when the client has no agent row yet, rather than defaults", async () => {
    // The API route layer is responsible for falling back to defaults; the
    // data layer just reports what's in the DB so callers can tell "not
    // customized yet" apart from "customized to the defaults".
    const fake = makeFakeSupabase({ voice_demo_settings: () => ({ data: null }) });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    expect(await getVoiceAgentSettingsForClient("client-123")).toBeNull();
  });
});

describe("getVoiceAgentPromptHistory", () => {
  it("filters by the given client_id", async () => {
    const fake = makeFakeSupabase({ voice_demo_prompt_history: () => ({ data: [] }) });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await getVoiceAgentPromptHistory("client-123");

    expect(eqArg(fake.calls[0], "client_id")).toBe("client-123");
  });
});

describe("saveVoiceAgentSettings", () => {
  const update = {
    model: "gpt-realtime",
    voice: "cedar",
    speed: 1,
    turnDetection: { type: "semantic_vad" as const, eagerness: "medium" as const, interrupt_response: true },
    noiseReduction: "near_field" as const,
    transcriptionModel: "gpt-4o-transcribe",
    transcriptionLanguage: "no",
    instructions: "Handz On v2",
  };

  it("inserts a new row keyed off the client id when none exists yet", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) => {
        if (call.ops.some((o) => o.method === "select")) return { data: null };
        return { error: null };
      },
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    const result = await saveVoiceAgentSettings("client-abc", update);

    expect(result).toEqual({});
    const insertCall = fake.calls.find((c) => c.ops.some((o) => o.method === "insert"));
    expect(insertCall).toBeDefined();
    const insertArg = insertCall!.ops.find((o) => o.method === "insert")!.arg as Record<string, unknown>;
    expect(insertArg.id).toBe("agent-client-abc");
    expect(insertArg.client_id).toBe("client-abc");
    // No prior row -> nothing to snapshot into history.
    expect(fake.calls.find((c) => c.table === "voice_demo_prompt_history")).toBeUndefined();
  });

  it("updates the existing row by its own id when one already exists, and snapshots history", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) => {
        if (call.ops.some((o) => o.method === "select")) {
          return { data: { id: "handzon-strommen", instructions: "Handz On v1" } };
        }
        return { error: null };
      },
      voice_demo_prompt_history: () => ({ error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    const result = await saveVoiceAgentSettings("client-abc", update);

    expect(result).toEqual({});
    const updateCall = fake.calls.find((c) => c.ops.some((o) => o.method === "update"));
    expect(eqArg(updateCall!, "id")).toBe("handzon-strommen");
    // Must not fall back to inserting a new settings row once an existing
    // one was found (a history-table insert for the snapshot is expected).
    expect(
      fake.calls.some((c) => c.table === "voice_demo_settings" && c.ops.some((o) => o.method === "insert")),
    ).toBe(false);

    const historyInsert = fake.calls.find((c) => c.table === "voice_demo_prompt_history");
    const historyArg = historyInsert!.ops.find((o) => o.method === "insert")!.arg as Record<string, unknown>;
    expect(historyArg).toMatchObject({ client_id: "client-abc", instructions: "Handz On v1" });
  });

  it("scopes the history snapshot's client_id so it can never be mistaken for the marketing demo's history", async () => {
    const fake = makeFakeSupabase({
      voice_demo_settings: (call) =>
        call.ops.some((o) => o.method === "select")
          ? { data: { id: "handzon-strommen", instructions: "old" } }
          : { error: null },
      voice_demo_prompt_history: () => ({ error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(fake as never);

    await saveVoiceAgentSettings("client-abc", { ...update, instructions: "new" });

    const historyInsert = fake.calls.find((c) => c.table === "voice_demo_prompt_history");
    const historyArg = historyInsert!.ops.find((o) => o.method === "insert")!.arg as Record<string, unknown>;
    expect(historyArg.client_id).toBe("client-abc");
  });
});
