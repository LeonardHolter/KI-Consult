import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/voiceDemo/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voiceDemo/data")>();
  return { ...actual, getVoiceDemoSettingsPublic: vi.fn() };
});
vi.mock("@/lib/voiceDemo/mintClientSecret", () => ({ mintRealtimeClientSecret: vi.fn() }));

import { getVoiceDemoSettingsPublic } from "@/lib/voiceDemo/data";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";
import { POST } from "@/app/api/voice/session/route";

const SETTINGS = {
  model: "gpt-realtime",
  voice: "marin",
  speed: 1,
  turnDetection: { type: "semantic_vad" as const, eagerness: "medium" as const, interrupt_response: true },
  noiseReduction: "near_field" as const,
  transcriptionModel: "gpt-4o-transcribe",
  transcriptionLanguage: "no",
  instructions: "Hei og velkommen",
};

beforeEach(() => {
  vi.mocked(getVoiceDemoSettingsPublic).mockReset().mockResolvedValue(SETTINGS);
  vi.mocked(mintRealtimeClientSecret).mockReset();
});

describe("POST /api/voice/session (public, no auth — anyone on the marketing site)", () => {
  it("requires no authentication at all — this is the whole point of the route", async () => {
    // No getProfile mock, no session, no cookies — just calling it directly
    // must work, since real anonymous website visitors have none of those.
    vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
      ok: true,
      clientSecret: "ek_public",
      model: "gpt-realtime",
    });

    const res = await POST();

    expect(res.status).toBe(200);
  });

  it("mints using whatever getVoiceDemoSettingsPublic currently returns (live-tunable)", async () => {
    vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
      ok: true,
      clientSecret: "ek_public",
      model: "gpt-realtime",
    });

    await POST();

    // withHangupTool: the demo registers ONLY finish_session — a graceful
    // hangup needs no server executor, and booking tools would leave calls
    // hanging on a surface with nowhere to run them.
    expect(mintRealtimeClientSecret).toHaveBeenCalledWith(SETTINGS, { withHangupTool: true });
  });

  it("returns clientSecret + model on success", async () => {
    vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
      ok: true,
      clientSecret: "ek_public",
      model: "gpt-realtime",
    });

    const res = await POST();

    expect(await res.json()).toEqual({ clientSecret: "ek_public", model: "gpt-realtime" });
  });

  it("propagates a mint failure's status/body rather than leaking a generic 500", async () => {
    vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
      ok: false,
      status: 503,
      body: { error: "not_configured", message: "OPENAI_API_KEY mangler." },
    });

    const res = await POST();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured", message: "OPENAI_API_KEY mangler." });
  });
});
