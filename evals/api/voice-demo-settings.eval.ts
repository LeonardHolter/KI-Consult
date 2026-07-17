import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/data", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/voiceDemo/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voiceDemo/data")>();
  return {
    ...actual,
    getVoiceDemoSettingsAdmin: vi.fn(),
    getVoiceDemoPromptHistory: vi.fn(),
    getVoiceAgentSettingsForClient: vi.fn(),
    getVoiceAgentPromptHistory: vi.fn(),
    saveVoiceDemoSettings: vi.fn(),
    saveVoiceAgentSettings: vi.fn(),
  };
});

import { getProfile } from "@/lib/portal/data";
import {
  getVoiceAgentPromptHistory,
  getVoiceAgentSettingsForClient,
  getVoiceDemoPromptHistory,
  getVoiceDemoSettingsAdmin,
  saveVoiceAgentSettings,
  saveVoiceDemoSettings,
} from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";
import { GET, PUT } from "@/app/api/portal/voice-demo/settings/route";

const ADMIN = { id: "a1", role: "admin" as const, client_id: null, full_name: null };
const CLIENT = { id: "u1", role: "client" as const, client_id: "c1", full_name: null };

function getReq(url: string) {
  return new Request(url);
}
function putReq(body: unknown) {
  return new Request("http://localhost/api/portal/voice-demo/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FULL_UPDATE = {
  model: "gpt-realtime",
  voice: "marin",
  speed: 1,
  turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
  noiseReduction: "near_field",
  transcriptionModel: "gpt-4o-transcribe",
  transcriptionLanguage: "no",
  instructions: "hello",
};

beforeEach(() => {
  vi.mocked(getProfile).mockReset();
  vi.mocked(getVoiceDemoSettingsAdmin).mockReset().mockResolvedValue(null);
  vi.mocked(getVoiceDemoPromptHistory).mockReset().mockResolvedValue([]);
  vi.mocked(getVoiceAgentSettingsForClient).mockReset().mockResolvedValue(null);
  vi.mocked(getVoiceAgentPromptHistory).mockReset().mockResolvedValue([]);
  vi.mocked(saveVoiceDemoSettings).mockReset().mockResolvedValue({});
  vi.mocked(saveVoiceAgentSettings).mockReset().mockResolvedValue({});
});

describe("GET /api/portal/voice-demo/settings", () => {
  it("403s a non-admin (client role) entirely — this is the tuner, not the dashboard", async () => {
    vi.mocked(getProfile).mockResolvedValue(CLIENT);

    const res = await GET(getReq("http://localhost/api/portal/voice-demo/settings"));

    expect(res.status).toBe(403);
    expect(getVoiceDemoSettingsAdmin).not.toHaveBeenCalled();
  });

  it("403s a logged-out visitor", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const res = await GET(getReq("http://localhost/api/portal/voice-demo/settings"));
    expect(res.status).toBe(403);
  });

  it("with no ?client=, reads the marketing-demo functions, not the per-client ones", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await GET(getReq("http://localhost/api/portal/voice-demo/settings"));

    expect(getVoiceDemoSettingsAdmin).toHaveBeenCalledOnce();
    expect(getVoiceDemoPromptHistory).toHaveBeenCalledOnce();
    expect(getVoiceAgentSettingsForClient).not.toHaveBeenCalled();
  });

  it("with ?client=X, reads the per-client functions with that id, not the marketing-demo ones", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await GET(getReq("http://localhost/api/portal/voice-demo/settings?client=handzon-id"));

    expect(getVoiceAgentSettingsForClient).toHaveBeenCalledWith("handzon-id");
    expect(getVoiceAgentPromptHistory).toHaveBeenCalledWith("handzon-id");
    expect(getVoiceDemoSettingsAdmin).not.toHaveBeenCalled();
  });

  it("reports migrationApplied: false and returns generic defaults when nothing is saved yet", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);
    vi.mocked(getVoiceDemoSettingsAdmin).mockResolvedValue(null);

    const res = await GET(getReq("http://localhost/api/portal/voice-demo/settings"));
    const body = await res.json();

    expect(body.migrationApplied).toBe(false);
    expect(body.settings.instructions).toBe(DEFAULT_VOICE_DEMO_PROMPT);
  });

  it("reports migrationApplied: true and returns the saved row when one exists", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);
    vi.mocked(getVoiceDemoSettingsAdmin).mockResolvedValue({
      model: "gpt-realtime-mini",
      voice: "cedar",
      speed: 1,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: "saved",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    const res = await GET(getReq("http://localhost/api/portal/voice-demo/settings"));
    const body = await res.json();

    expect(body.migrationApplied).toBe(true);
    expect(body.settings.instructions).toBe("saved");
  });
});

describe("PUT /api/portal/voice-demo/settings", () => {
  it("403s a non-admin", async () => {
    vi.mocked(getProfile).mockResolvedValue(CLIENT);
    const res = await PUT(putReq(FULL_UPDATE));
    expect(res.status).toBe(403);
    expect(saveVoiceDemoSettings).not.toHaveBeenCalled();
  });

  it("400s when instructions is missing or not a string", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    const res = await PUT(putReq({ ...FULL_UPDATE, instructions: undefined }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("400s on unparseable JSON instead of throwing", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);
    const badReq = new Request("http://localhost/api/portal/voice-demo/settings", {
      method: "PUT",
      body: "not json",
    });

    const res = await PUT(badReq);
    expect(res.status).toBe(400);
  });

  it("without clientId in the body, saves to the marketing-demo path", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await PUT(putReq(FULL_UPDATE));

    expect(saveVoiceDemoSettings).toHaveBeenCalledWith(expect.objectContaining({ instructions: "hello" }));
    expect(saveVoiceAgentSettings).not.toHaveBeenCalled();
  });

  it("with clientId in the body, saves to that client's agent instead", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await PUT(putReq({ ...FULL_UPDATE, clientId: "handzon-id" }));

    expect(saveVoiceAgentSettings).toHaveBeenCalledWith(
      "handzon-id",
      expect.objectContaining({ instructions: "hello" }),
    );
    expect(saveVoiceDemoSettings).not.toHaveBeenCalled();
  });

  it("returns 500 with the DB error message when the save fails", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);
    vi.mocked(saveVoiceDemoSettings).mockResolvedValue({ error: "duplicate key" });

    const res = await PUT(putReq(FULL_UPDATE));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "duplicate key" });
  });
});
