// Admin-only twin of /api/voice/session: mints an ephemeral OpenAI Realtime
// client secret using whatever draft settings the tuner UI currently holds
// (not necessarily saved yet), so changes can be heard before committing
// them. Gated behind admin auth — unlike the public route, this accepts
// arbitrary instructions/settings from the request body, which would
// otherwise be a free way to spend the OpenAI key. Used by both the
// marketing-demo tuner and any client's per-agent tuner.

import { getProfile } from "@/lib/portal/data";
import { DEFAULT_SETTINGS } from "@/lib/voiceDemo/data";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.instructions !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // A client agent's prompt documents the booking tools, so the test session
  // MUST register them too — otherwise the model announces "jeg sjekker
  // kalenderen", finds nothing to call, and degrades (it starts emitting text
  // instead of audio). That mismatch between prompt and tool list is the exact
  // failure OpenAI's realtime prompting guide warns about. The marketing
  // tannlege demo has no clientId and no tools, and must stay that way — there
  // is no calendar behind it.
  const clientId = typeof body.clientId === "string" ? body.clientId : null;

  const result = await mintRealtimeClientSecret(
    {
      model: body.model ?? DEFAULT_SETTINGS.model,
      voice: body.voice ?? DEFAULT_SETTINGS.voice,
      speed: body.speed ?? DEFAULT_SETTINGS.speed,
      turnDetection: body.turnDetection ?? DEFAULT_SETTINGS.turnDetection,
      noiseReduction: body.noiseReduction ?? DEFAULT_SETTINGS.noiseReduction,
      transcriptionModel: body.transcriptionModel ?? DEFAULT_SETTINGS.transcriptionModel,
      transcriptionLanguage: body.transcriptionLanguage ?? DEFAULT_SETTINGS.transcriptionLanguage,
      instructions: body.instructions,
    },
    // Client agents get the full toolset; the default marketing demo gets
    // only the hangup tool — mirroring exactly what each public surface
    // registers, so the tuner tests what actually runs.
    { withTools: Boolean(clientId), withHangupTool: !clientId },
  );

  if (!result.ok) return Response.json(result.body, { status: result.status });
  return Response.json({ clientSecret: result.clientSecret, model: result.model });
}
