import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/data", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/voiceDemo/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voiceDemo/data")>();
  return { ...actual, getVoiceAgentSettingsForClient: vi.fn() };
});
vi.mock("@/lib/voiceDemo/mintClientSecret", () => ({ mintRealtimeClientSecret: vi.fn() }));

import { getProfile } from "@/lib/portal/data";
import { getVoiceAgentSettingsForClient } from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";
import { POST } from "@/app/api/portal/voice-agent/session/route";

function req(body?: unknown) {
  return new Request("http://localhost/api/portal/voice-agent/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getProfile).mockReset();
  vi.mocked(getVoiceAgentSettingsForClient).mockReset();
  vi.mocked(mintRealtimeClientSecret).mockReset();
  vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
    ok: true,
    clientSecret: "ek_test",
    model: "gpt-realtime",
  });
});

describe("POST /api/portal/voice-agent/session", () => {
  it("403s a logged-out visitor before touching the DB or OpenAI", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);

    const res = await POST(req({}));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(getVoiceAgentSettingsForClient).not.toHaveBeenCalled();
    expect(mintRealtimeClientSecret).not.toHaveBeenCalled();
  });

  it("client role always uses their own client_id, ignoring anything in the body", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      role: "client",
      client_id: "handzon-id",
      full_name: null,
    });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue(null);

    // A malicious/confused body trying to point at a different client must
    // be ignored for the client role — this is the actual security boundary.
    await POST(req({ clientId: "someone-elses-client-id" }));

    expect(getVoiceAgentSettingsForClient).toHaveBeenCalledWith("handzon-id");
  });

  it("client role with no client_id on their profile gets 400 no_client, not a crash", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", role: "client", client_id: null, full_name: null });

    const res = await POST(req({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_client" });
  });

  it("admin role requires clientId in the body — 400 no_client without it", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "admin1", role: "admin", client_id: null, full_name: null });

    const res = await POST(req({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_client" });
    expect(getVoiceAgentSettingsForClient).not.toHaveBeenCalled();
  });

  it("admin role uses the clientId supplied in the body", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "admin1", role: "admin", client_id: null, full_name: null });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue(null);

    await POST(req({ clientId: "target-client" }));

    expect(getVoiceAgentSettingsForClient).toHaveBeenCalledWith("target-client");
  });

  it("falls back to the default settings + tannlege prompt when the client has no saved agent yet", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", role: "client", client_id: "c1", full_name: null });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue(null);

    await POST(req({}));

    const mintedWith = vi.mocked(mintRealtimeClientSecret).mock.calls[0][0];
    expect(mintedWith.model).toBe("gpt-realtime");
    expect(mintedWith.instructions).toBe(DEFAULT_VOICE_DEMO_PROMPT);
  });

  it("uses the client's saved settings verbatim when they exist", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", role: "client", client_id: "c1", full_name: null });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue({
      model: "gpt-realtime-mini",
      voice: "cedar",
      speed: 1,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: "Handz On script",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    await POST(req({}));

    const mintedWith = vi.mocked(mintRealtimeClientSecret).mock.calls[0][0];
    expect(mintedWith.voice).toBe("cedar");
    expect(mintedWith.instructions).toBe("Handz On script");
  });

  it("returns clientSecret+model on success", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", role: "client", client_id: "c1", full_name: null });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue(null);

    const res = await POST(req({}));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "ek_test", model: "gpt-realtime" });
  });

  it("propagates the mint failure's status and body instead of masking it", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", role: "client", client_id: "c1", full_name: null });
    vi.mocked(getVoiceAgentSettingsForClient).mockResolvedValue(null);
    vi.mocked(mintRealtimeClientSecret).mockResolvedValue({
      ok: false,
      status: 503,
      body: { error: "not_configured", message: "OPENAI_API_KEY mangler." },
    });

    const res = await POST(req({}));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured", message: "OPENAI_API_KEY mangler." });
  });
});
