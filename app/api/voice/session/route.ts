// Mints an ephemeral OpenAI Realtime client secret so the browser can connect
// over WebRTC without ever seeing the real API key. Session config comes from
// voice_demo_settings (tunable live from /portal/voice-demo) rather than
// being hardcoded, so admin tuning takes effect on the public demo
// immediately. Same architecture as the handzon-voice-lab tuning lab.
// https://developers.openai.com/api/docs/guides/realtime

import { getVoiceDemoSettingsPublic } from "@/lib/voiceDemo/data";

export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "not_configured",
        message: "Sett OPENAI_API_KEY i .env.local for å aktivere live-demoen.",
      },
      { status: 503 },
    );
  }

  const settings = await getVoiceDemoSettingsPublic();

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

  try {
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
      return Response.json(
        {
          error: "token_request_failed",
          message: body?.error?.message ?? "Kunne ikke opprette client secret",
          detail: body,
        },
        { status: res.status },
      );
    }

    return Response.json({ clientSecret: body.value, model: session.model });
  } catch (err) {
    return Response.json(
      { error: "unexpected", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
