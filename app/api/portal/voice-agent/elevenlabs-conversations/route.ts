// Transcripts for the ElevenLabs pilot agents. ElevenLabs stores every
// conversation (browser and phone) with a full transcript, so the admin
// panel reads them straight from their API instead of us capturing and
// storing text ourselves — no webhook, no storage, nothing to drift.
//
// GET                  -> list of recent conversations (id, when, duration…)
// GET ?conversation=id -> that conversation's transcript
// DELETE ?conversation=id -> removes it AT ElevenLabs, permanently
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

/** Resolves the client this request may touch, and that client's agent.
 *  Same rule as everywhere else in the portal: a client account is pinned to
 *  its own client, an admin names one, and neither can reach a client that
 *  is not on ElevenLabs. */
async function resolveAgent(
  req: Request,
  profile: { role: string; client_id: string | null },
): Promise<{ agentId: string } | { error: Response }> {
  const clientId =
    profile.role === "admin" ? new URL(req.url).searchParams.get("clientId") : profile.client_id;
  if (!clientId) return { error: Response.json({ error: "no_client" }, { status: 400 }) };
  const agentId = elevenlabsAgentIdFor(clientId);
  if (!agentId) return { error: Response.json({ error: "not_elevenlabs_client" }, { status: 404 }) };
  return { agentId };
}

/**
 * Deletes one conversation at ElevenLabs — transcript and recording of what
 * the agent said to a customer, gone for good; there is no copy on our side.
 * So it mirrors the recordings route exactly: ADMIN ONLY. A client can read
 * their own calls but not remove review material.
 *
 * The conversation is fetched first and its agent_id checked, because ids are
 * short and the workspace key can delete any conversation in the account —
 * without that check a crafted id could erase another client's call.
 */
export async function DELETE(req: Request) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const resolved = await resolveAgent(req, profile);
  if ("error" in resolved) return resolved.error;

  const conversationId = new URL(req.url).searchParams.get("conversation");
  if (!conversationId || !/^[a-zA-Z0-9_-]+$/.test(conversationId)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "elevenlabs_not_configured" }, { status: 500 });

  try {
    const check = await el(`/v1/convai/conversations/${conversationId}`, apiKey);
    if (!check.ok) return Response.json({ error: "not_found" }, { status: 404 });
    if ((await check.json()).agent_id !== resolved.agentId) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const res = await fetch(`${BASE}/v1/convai/conversations/${conversationId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[elevenlabs-conversations] delete failed: ${res.status} ${await res.text()}`);
      return Response.json({ error: "elevenlabs_error" }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[elevenlabs-conversations] delete: ${err instanceof Error ? err.message : err}`);
    return Response.json({ error: "elevenlabs_error" }, { status: 502 });
  }
}

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
