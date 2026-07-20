// Mints an ephemeral OpenAI Realtime client secret for a client's saved,
// live voice agent — the "Snakk med agenten" button on the dashboard. Unlike
// the tuner's test-session route, this always uses the SAVED settings (no
// draft override), and resolves which client from the caller's own session:
// a client user always gets their own agent; an admin viewing someone else's
// dashboard must say which client via the request body.

import { getProfile } from "@/lib/portal/data";
import { DEFAULT_SETTINGS, getVoiceAgentSettingsForClient } from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  let clientId: string | null = profile.client_id;
  if (profile.role === "admin") {
    const body = await req.json().catch(() => ({}));
    clientId = typeof body.clientId === "string" ? body.clientId : null;
  }
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const settings = (await getVoiceAgentSettingsForClient(clientId)) ?? {
    ...DEFAULT_SETTINGS,
    instructions: DEFAULT_VOICE_DEMO_PROMPT,
  };

  // Tools on: this is the one surface with an authenticated executor behind
  // it (/api/portal/voice-agent/tools).
  const result = await mintRealtimeClientSecret(settings, { withTools: true });
  if (!result.ok) return Response.json(result.body, { status: result.status });
  return Response.json({ clientSecret: result.clientSecret, model: result.model });
}
