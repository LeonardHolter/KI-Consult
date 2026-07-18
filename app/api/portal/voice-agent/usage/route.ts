// Records a completed voice-agent call's duration and token usage. Called
// by the browser itself on hangup — unlike the chat bot, the actual WebRTC
// audio never touches our backend (it's a direct browser<->OpenAI
// connection), so this is the only place that ever learns what a call
// actually cost. Session-scoped (RLS insert policy): a client user may only
// log their own client's usage, an admin may log for the client they're
// viewing.

import { getProfile } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.startedAt !== "string" ||
    typeof body.endedAt !== "string" ||
    typeof body.durationSeconds !== "number"
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  let clientId: string | null = profile.client_id;
  if (profile.role === "admin") {
    clientId = typeof body.clientId === "string" ? body.clientId : null;
  }
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("voice_usage").insert({
    client_id: clientId,
    started_at: body.startedAt,
    ended_at: body.endedAt,
    duration_seconds: Math.max(0, Math.round(body.durationSeconds)),
    input_tokens: body.usage?.inputTokens ?? 0,
    output_tokens: body.usage?.outputTokens ?? 0,
    cache_creation_input_tokens: body.usage?.cacheCreationInputTokens ?? 0,
    cache_read_input_tokens: body.usage?.cacheReadInputTokens ?? 0,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
