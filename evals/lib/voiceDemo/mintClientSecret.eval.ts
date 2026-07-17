import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";
import type { VoiceDemoSettings } from "@/lib/voiceDemo/types";

const settings: VoiceDemoSettings & { instructions: string } = {
  model: "gpt-realtime",
  voice: "marin",
  speed: 1.0,
  turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
  noiseReduction: "near_field",
  transcriptionModel: "gpt-4o-transcribe",
  transcriptionLanguage: "no",
  instructions: "Du er Ida.",
};

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test-key";
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe("mintRealtimeClientSecret", () => {
  it("returns not_configured (503) without ever calling OpenAI when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await mintRealtimeClientSecret(settings);

    expect(result).toEqual({
      ok: false,
      status: 503,
      body: { error: "not_configured", message: "OPENAI_API_KEY mangler." },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mints a client secret on success and builds the correct session shape", async () => {
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
      expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test-key" });

      const body = JSON.parse(init.body as string);
      expect(body.session).toMatchObject({
        type: "realtime",
        model: "gpt-realtime",
        instructions: "Du er Ida.",
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe", language: "no" },
            turn_detection: settings.turnDetection,
            noise_reduction: { type: "near_field" },
          },
          output: { voice: "marin", speed: 1.0 },
        },
      });

      return new Response(JSON.stringify({ value: "ek_abc123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await mintRealtimeClientSecret(settings);

    expect(result).toEqual({ ok: true, clientSecret: "ek_abc123", model: "gpt-realtime" });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("omits noise_reduction entirely when set to off", async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.session.audio.input.noise_reduction).toBeUndefined();
      return new Response(JSON.stringify({ value: "ek_x" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await mintRealtimeClientSecret({ ...settings, noiseReduction: "off" });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("propagates OpenAI's error status and message when the request fails", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "invalid model" } }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await mintRealtimeClientSecret(settings);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        error: "token_request_failed",
        message: "invalid model",
      });
    }
  });
});
