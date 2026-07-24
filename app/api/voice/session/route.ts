// Mints an ephemeral OpenAI Realtime client secret so the browser can connect
// over WebRTC without ever seeing the real API key. Session config comes from
// voice_demo_settings (tunable live from /portal/voice-demo) rather than
// being hardcoded, so admin tuning takes effect on the public demo
// immediately. Same architecture as the handzon-voice-lab tuning lab.
// https://developers.openai.com/api/docs/guides/realtime

import { getVoiceDemoSettingsPublic } from "@/lib/voiceDemo/data";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";

export const dynamic = "force-dynamic";

export async function POST() {
  const settings = await getVoiceDemoSettingsPublic();
  // finish_session only: the browser intercepts it to hang up gracefully;
  // the demo has no booking executor, so no other tools are registered.
  const result = await mintRealtimeClientSecret(settings, { withHangupTool: true });
  if (!result.ok) return Response.json(result.body, { status: result.status });
  return Response.json({ clientSecret: result.clientSecret, model: result.model });
}
