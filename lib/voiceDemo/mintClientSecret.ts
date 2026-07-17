import type { VoiceDemoSettings } from "./types";

/**
 * Shared OpenAI Realtime ephemeral-secret minting, used by all three session
 * routes (public marketing demo, admin draft-testing, per-client dashboard
 * button) so the session-shape logic lives in exactly one place.
 */
export async function mintRealtimeClientSecret(
  settings: VoiceDemoSettings & { instructions: string },
): Promise<
  | { ok: true; clientSecret: string; model: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: { error: "not_configured", message: "OPENAI_API_KEY mangler." },
    };
  }

  const session = {
    type: "realtime",
    model: settings.model,
    output_modalities: ["audio"],
    instructions: settings.instructions,
    audio: {
      input: {
        transcription: {
          model: settings.transcriptionModel,
          ...(settings.transcriptionLanguage ? { language: settings.transcriptionLanguage } : {}),
        },
        turn_detection: settings.turnDetection,
        ...(settings.noiseReduction !== "off"
          ? { noise_reduction: { type: settings.noiseReduction } }
          : {}),
      },
      output: { voice: settings.voice, speed: settings.speed },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });

  const body = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: {
        error: "token_request_failed",
        message: body?.error?.message ?? "Kunne ikke opprette client secret",
        detail: body,
      },
    };
  }

  return { ok: true, clientSecret: body.value, model: session.model };
}
