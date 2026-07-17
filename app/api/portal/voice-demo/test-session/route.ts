// Admin-only twin of /api/voice/session: mints an ephemeral OpenAI Realtime
// client secret using whatever draft settings the tuner UI currently holds
// (not necessarily saved yet), so changes can be heard before committing
// them. Gated behind admin auth — unlike the public route, this accepts
// arbitrary instructions/settings from the request body, which would
// otherwise be a free way to spend the OpenAI key.

import { getProfile } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "not_configured", message: "OPENAI_API_KEY mangler." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.instructions !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const session = {
    type: "realtime",
    model: body.model ?? "gpt-realtime",
    output_modalities: ["audio"],
    instructions: body.instructions,
    audio: {
      input: {
        transcription: {
          model: body.transcriptionModel ?? "gpt-4o-transcribe",
          ...(body.transcriptionLanguage ? { language: body.transcriptionLanguage } : {}),
        },
        turn_detection: body.turnDetection ?? {
          type: "semantic_vad",
          eagerness: "medium",
          interrupt_response: true,
        },
        ...(body.noiseReduction && body.noiseReduction !== "off"
          ? { noise_reduction: { type: body.noiseReduction } }
          : {}),
      },
      output: { voice: body.voice ?? "marin", speed: body.speed ?? 1.0 },
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

    const respBody = await res.json();
    if (!res.ok) {
      return Response.json(
        {
          error: "token_request_failed",
          message: respBody?.error?.message ?? "Kunne ikke opprette client secret",
          detail: respBody,
        },
        { status: res.status },
      );
    }

    return Response.json({ clientSecret: respBody.value, model: session.model });
  } catch (err) {
    return Response.json(
      { error: "unexpected", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
