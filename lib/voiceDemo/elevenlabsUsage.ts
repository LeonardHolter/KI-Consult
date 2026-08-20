// Keeps voice_usage (the calls/minutes KPI source) alive for ElevenLabs
// pilot clients. The OpenAI paths write rows themselves (browser card on
// hangup, phone bridge on call end); ElevenLabs calls never touch our
// servers, so the dashboard pulls the ledger from ElevenLabs' conversation
// list instead — lazily, whenever KPIs are read.
//
// Dedupe: voice_usage has no external-id column, but a conversation's start
// time is second-exact and immutable, so (client_id, started_at) identifies
// it. That pair is also a unique index (supabase/009), which is what makes
// two dashboards loading at once safe — without it both would see the row
// missing and both insert, permanently inflating the client's call count.
// Token columns stay 0: ElevenLabs bills per minute, and minutes are what
// the KPI reads.
//
// EVERYTHING here is inside one try. This runs in front of the whole
// dashboard render (lib/kpi.ts), so a surprise from upstream — a missing
// timestamp, a schema change, Supabase being down — must degrade to "the
// newest calls aren't counted yet", never to a 500 on the page.

import { createServiceClient } from "@/lib/supabase/service";
import { elevenlabsAgentIdFor } from "@/lib/voiceDemo/elevenlabsAgents";

type ConversationRow = {
  conversation_id: string;
  start_time_unix_secs: number;
  call_duration_secs: number | null;
  status: string;
};

/** Newest N conversations to reconcile per read. Comfortably more than a
 *  client makes between two dashboard loads; older ones are already stored. */
const PAGE_SIZE = 100;
/** This sits in front of the dashboard, so it may not hold it hostage. */
const TIMEOUT_MS = 4000;

export async function syncElevenLabsVoiceUsage(clientId: string): Promise<void> {
  const agentId = elevenlabsAgentIdFor(clientId);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) return;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=${PAGE_SIZE}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return;
    const conversations = ((await res.json()).conversations ?? []) as ConversationRow[];

    // start_time_unix_secs is load-bearing twice over (dedupe key and stored
    // timestamp), and an absent one would reach new Date(NaN).toISOString(),
    // which throws. Validate rather than trust.
    const done = conversations.filter(
      (c) =>
        c.status === "done" &&
        Number.isFinite(c.call_duration_secs) &&
        (c.call_duration_secs ?? 0) > 0 &&
        Number.isFinite(c.start_time_unix_secs),
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
        ended_at: new Date(
          (c.start_time_unix_secs + (c.call_duration_secs ?? 0)) * 1000,
        ).toISOString(),
        duration_seconds: c.call_duration_secs ?? 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }));
    if (!missing.length) return;

    // upsert + ignoreDuplicates: the select above narrows the work, the
    // unique index settles the race. Supabase returns errors rather than
    // throwing them, so an RLS or constraint problem would otherwise vanish
    // and the tiles would just stay quietly wrong.
    const { error } = await supabase
      .from("voice_usage")
      .upsert(missing, { onConflict: "client_id,started_at", ignoreDuplicates: true });
    if (error) {
      console.warn(`[elevenlabs-usage] kunne ikke lagre ${missing.length} samtaler: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[elevenlabs-usage] synk hoppet over: ${err instanceof Error ? err.message : err}`);
  }
}
