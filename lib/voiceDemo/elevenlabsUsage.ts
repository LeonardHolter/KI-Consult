// Keeps voice_usage (the calls/minutes KPI source) alive for ElevenLabs
// pilot clients. The OpenAI paths write rows themselves (browser card on
// hangup, phone bridge on call end); ElevenLabs calls never touch our
// servers mid-call, so the dashboard pulls the ledger from ElevenLabs'
// conversation list instead — lazily, whenever KPIs are read.
//
// Dedupe: voice_usage has no external-id column, but a conversation's
// start time is second-exact and immutable, so (client_id, started_at)
// identifies it. Token columns stay 0 — ElevenLabs bills per minute, and
// minutes are what the KPI reads.

import { createServiceClient } from "@/lib/supabase/service";
import { elevenlabsAgentIdFor } from "@/lib/voiceDemo/elevenlabsAgents";

type ConversationRow = {
  conversation_id: string;
  start_time_unix_secs: number;
  call_duration_secs: number | null;
  status: string;
};

export async function syncElevenLabsVoiceUsage(clientId: string): Promise<void> {
  const agentId = elevenlabsAgentIdFor(clientId);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) return;

  let conversations: ConversationRow[];
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=50`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return;
    conversations = ((await res.json()).conversations ?? []) as ConversationRow[];
  } catch {
    return; // KPI-lesingen skal aldri feile på synken
  }

  const done = conversations.filter(
    (c) => c.status === "done" && (c.call_duration_secs ?? 0) > 0,
  );
  if (!done.length) return;

  const supabase = createServiceClient();
  const oldest = new Date(Math.min(...done.map((c) => c.start_time_unix_secs)) * 1000);
  const { data: existing } = await supabase
    .from("voice_usage")
    .select("started_at")
    .eq("client_id", clientId)
    .gte("started_at", oldest.toISOString());
  const seen = new Set((existing ?? []).map((r) => new Date(r.started_at).getTime()));

  const missing = done
    .filter((c) => !seen.has(c.start_time_unix_secs * 1000))
    .map((c) => ({
      client_id: clientId,
      started_at: new Date(c.start_time_unix_secs * 1000).toISOString(),
      ended_at: new Date((c.start_time_unix_secs + (c.call_duration_secs ?? 0)) * 1000).toISOString(),
      duration_seconds: c.call_duration_secs ?? 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }));

  if (missing.length) await supabase.from("voice_usage").insert(missing);
}
