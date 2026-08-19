// Mints an ElevenLabs signed conversation URL for the dashboard voice agent
// of clients in the ElevenLabs pilot (lib/voiceDemo/elevenlabsAgents.ts).
// Mirrors the OpenAI session route next door: a client user always gets
// their own agent; an admin must name the client in the body. Clients
// outside the pilot get 404 — their dashboards never call this route.

import { getProfile } from "@/lib/portal/data";
import { elevenlabsAgentIdFor } from "@/lib/voiceDemo/elevenlabsAgents";

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

  const agentId = elevenlabsAgentIdFor(clientId);
  if (!agentId) return Response.json({ error: "not_elevenlabs_client" }, { status: 404 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "elevenlabs_not_configured" }, { status: 500 });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    console.error(`[elevenlabs-session] signed-url failed: ${res.status} ${await res.text()}`);
    return Response.json({ error: "elevenlabs_error" }, { status: 502 });
  }
  const { signed_url } = await res.json();
  return Response.json({ signedUrl: signed_url });
}
