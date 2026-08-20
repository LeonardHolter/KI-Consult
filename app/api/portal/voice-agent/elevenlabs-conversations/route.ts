// Transcripts for the ElevenLabs pilot agents. ElevenLabs stores every
// conversation (browser and phone) with a full transcript, so the admin
// panel reads them straight from their API instead of us capturing and
// storing text ourselves — no webhook, no storage, nothing to drift.
//
// GET                  -> list of recent conversations (id, when, duration…)
// GET ?conversation=id -> that conversation's transcript
//
// Same access model as the other portal voice-agent routes: a client user is
// pinned to their own client, an admin picks one via ?clientId=. Both only
// work for clients in the pilot map, and a requested conversation must
// belong to that client's agent — the agent_id check is what stops a portal
// user from reading another workspace conversation by guessing ids.

import { getProfile } from "@/lib/portal/data";
import { elevenlabsAgentIdFor } from "@/lib/voiceDemo/elevenlabsAgents";
import { conversationStatus } from "@/lib/voiceDemo/conversationStatus";

export const dynamic = "force-dynamic";

const BASE = "https://api.elevenlabs.io";

/** Timeout so a slow ElevenLabs cannot hang the panel to the platform limit. */
const TIMEOUT_MS = 8000;

async function el(path: string, apiKey: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

type TranscriptTurn = {
  role: string;
  message: string | null;
  time_in_call_secs?: number;
  tool_calls?: Array<{ tool_name?: string }>;
};

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const clientId =
    profile.role === "admin" ? url.searchParams.get("clientId") : profile.client_id;
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const agentId = elevenlabsAgentIdFor(clientId);
  if (!agentId) return Response.json({ error: "not_elevenlabs_client" }, { status: 404 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "elevenlabs_not_configured" }, { status: 500 });

  const conversationId = url.searchParams.get("conversation");

  if (conversationId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(conversationId)) {
      return Response.json({ error: "bad_id" }, { status: 400 });
    }
    const res = await el(`/v1/convai/conversations/${conversationId}`, apiKey);
    if (!res.ok) return Response.json({ error: "not_found" }, { status: 404 });
    const conv = await res.json();
    if (conv.agent_id !== agentId) {
      // Real conversation, wrong client — reveal nothing beyond "no".
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    // No summary: ElevenLabs writes it in whatever language it lands on, so
    // half of them arrive in English. The status tag carries the same "what
    // happened" signal, in Norwegian, at a glance.
    return Response.json({
      transcript: ((conv.transcript ?? []) as TranscriptTurn[])
        .filter((t) => t.message || t.tool_calls?.length)
        .map((t) => ({
          role: t.role === "user" ? "user" : "agent",
          message: t.message ?? null,
          timeInCallSecs: t.time_in_call_secs ?? null,
          toolCalls: (t.tool_calls ?? []).map((c) => c.tool_name).filter(Boolean),
        })),
    });
  }

  const res = await el(`/v1/convai/conversations?agent_id=${agentId}&page_size=30`, apiKey);
  if (!res.ok) {
    console.error(`[elevenlabs-conversations] list failed: ${res.status} ${await res.text()}`);
    return Response.json({ error: "elevenlabs_error" }, { status: 502 });
  }
  const { conversations } = await res.json();
  type Row = {
    conversation_id: string;
    start_time_unix_secs: number;
    call_duration_secs: number;
    message_count: number;
    status: string;
    call_successful?: string | null;
    termination_reason?: string | null;
    tool_names?: string[] | null;
  };
  return Response.json({
    conversations: ((conversations ?? []) as Row[])
      // A row without a usable start time would reach
      // new Date(NaN).toISOString() and throw, and the panel's catch turns
      // any failure into "Ingen samtaler ennå" — an admin would read a broken
      // API as a quiet day.
      .filter((c) => c.status !== "failed" && Number.isFinite(c.start_time_unix_secs))
      .map((c) => ({
        id: c.conversation_id,
        startedAt: new Date(c.start_time_unix_secs * 1000).toISOString(),
        durationSeconds: c.call_duration_secs ?? 0,
        messageCount: c.message_count ?? 0,
        status: conversationStatus({
          toolNames: c.tool_names,
          callSuccessful: c.call_successful,
          terminationReason: c.termination_reason,
          durationSeconds: c.call_duration_secs,
        }),
      })),
  });
}
