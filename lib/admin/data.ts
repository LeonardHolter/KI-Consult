import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { calendarConnected } from "@/lib/slots";
import { getChatBotSettingsAdmin } from "@/lib/chatBot/data";
import { getVoiceAgentSettingsForClient } from "@/lib/voiceDemo/data";

export type ClientHealth = {
  calendarConnected: boolean;
  chatConfigured: boolean;
  voiceConfigured: boolean;
};

/**
 * Per-client health, computed live rather than stored — each of these has a
 * *designed* silent-fallback path elsewhere in the codebase (booking falls
 * back to a fake demo calendar if Google Calendar isn't connected; the chat
 * bot and voice agent both fall back to generic defaults if unconfigured),
 * which is good for not crashing but means nobody notices unless someone
 * goes looking. This is that "someone looking," automated.
 */
export async function getClientHealth(clientId: string): Promise<ClientHealth> {
  const [settings, chatBot, voiceAgent] = await Promise.all([
    loadSettings(clientId),
    getChatBotSettingsAdmin(clientId),
    getVoiceAgentSettingsForClient(clientId),
  ]);
  return {
    calendarConnected: calendarConnected(settings),
    chatConfigured: chatBot !== null,
    voiceConfigured: voiceAgent !== null,
  };
}

export type EventCounts24h = {
  deflections: number;
  errors: number;
  toolErrors: number;
  rateLimited: number;
  corsRejected: number;
};

const EMPTY_COUNTS: EventCounts24h = { deflections: 0, errors: 0, toolErrors: 0, rateLimited: 0, corsRejected: 0 };

export async function getEventCounts24h(): Promise<Map<string, EventCounts24h>> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_event_counts_24h").select("*");
  const map = new Map<string, EventCounts24h>();
  for (const row of data ?? []) {
    map.set(row.client_id, {
      deflections: row.deflections ?? 0,
      errors: row.errors ?? 0,
      toolErrors: row.tool_errors ?? 0,
      rateLimited: row.rate_limited ?? 0,
      corsRejected: row.cors_rejected ?? 0,
    });
  }
  return map;
}

export function eventCountsFor(map: Map<string, EventCounts24h>, clientId: string): EventCounts24h {
  return map.get(clientId) ?? EMPTY_COUNTS;
}

export type BotEventRow = {
  id: number;
  surface: "chat" | "voice";
  type: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function getRecentBotEvents(clientId: string, limit = 100): Promise<BotEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_events")
    .select("id, surface, type, detail, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    surface: r.surface,
    type: r.type,
    detail: r.detail ?? {},
    createdAt: r.created_at,
  }));
}

export type VoiceUsageStats = {
  calls: number;
  totalSeconds: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export async function getVoiceUsageStats(): Promise<Map<string, VoiceUsageStats>> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_voice_usage_stats").select("*");
  const map = new Map<string, VoiceUsageStats>();
  for (const row of data ?? []) {
    map.set(row.client_id, {
      calls: row.calls ?? 0,
      totalSeconds: row.total_seconds ?? 0,
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      cacheCreationInputTokens: row.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: row.cache_read_input_tokens ?? 0,
    });
  }
  return map;
}

/** One bucket in the admin activity charts — a single Oslo calendar day. */
export type DayActivity = {
  date: string; // YYYY-MM-DD (Oslo)
  label: string; // short axis label, e.g. "15.7"
  chat: number; // chat conversations started that day
  voice: number; // voice calls that day
  voiceMinutes: number;
  booked: number; // chat conversations that ended in a booking
};

function osloDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Daily totals across ALL clients for the last `days` days, oldest first.
 *  Buckets by Oslo calendar day so "i dag" matches what the admin means. */
export async function getDailyActivity(days = 14): Promise<DayActivity[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const [conv, voice] = await Promise.all([
    supabase
      .from("conversations")
      .select("started_at, booked")
      .gte("started_at", since)
      .limit(5000),
    supabase
      .from("voice_usage")
      .select("started_at, duration_seconds")
      .gte("started_at", since)
      .limit(5000),
  ]);

  const buckets = new Map<string, DayActivity>();
  for (let i = days - 1; i >= 0; i--) {
    const date = osloDay(new Date(Date.now() - i * 24 * 3600 * 1000).toISOString());
    const [, m, d] = date.split("-");
    buckets.set(date, {
      date,
      label: `${Number(d)}.${Number(m)}`,
      chat: 0,
      voice: 0,
      voiceMinutes: 0,
      booked: 0,
    });
  }
  for (const row of conv.data ?? []) {
    const b = buckets.get(osloDay(row.started_at));
    if (!b) continue;
    b.chat += 1;
    if (row.booked) b.booked += 1;
  }
  for (const row of voice.data ?? []) {
    const b = buckets.get(osloDay(row.started_at));
    if (!b) continue;
    b.voice += 1;
    b.voiceMinutes += (row.duration_seconds ?? 0) / 60;
  }
  return [...buckets.values()];
}

export type ClientBilling = {
  plan: string | null;
  monthlyPriceNok: number | null;
  status: "trial" | "active" | "paused" | "churned";
  contactEmail: string | null;
  contactPhone: string | null;
};

export async function updateClientBilling(
  clientId: string,
  patch: Partial<ClientBilling>,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.monthlyPriceNok !== undefined) row.monthly_price_nok = patch.monthlyPriceNok;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;

  const { error } = await supabase.from("clients").update(row).eq("id", clientId);
  return error ? { error: error.message } : {};
}
