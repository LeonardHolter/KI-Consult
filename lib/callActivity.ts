// Per-day phone activity for ONE client — the series behind the chart on the
// client dashboard. The admin overview has its own, across every client
// (lib/admin/data.ts getDailyActivity); this one is scoped and reads the
// same ledger a client is allowed to see about itself.

import { createServiceClient } from "@/lib/supabase/service";
import { loadSettings } from "@/lib/settings";
import { syncElevenLabsVoiceUsage } from "@/lib/voiceDemo/elevenlabsUsage";

export type CallDay = {
  /** YYYY-MM-DD in Oslo time — the day a Norwegian shop means by "today". */
  date: string;
  /** Short axis label, e.g. "15.7". */
  label: string;
  calls: number;
  minutes: number;
};

function osloDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Calls and voice minutes per day for the last `days` days, oldest first.
 *
 * Every day in the window is present, including the quiet ones: a gap in a
 * bar chart reads as missing data, while a zero reads as a quiet Sunday, and
 * only one of those is true.
 *
 * Service-role, because voice_usage is admin-select-only under RLS — so the
 * CALLER owns tenancy, exactly like buildClientKpis.
 */
export async function getClientCallActivity(clientId: string, days = 14): Promise<CallDay[]> {
  // ElevenLabs clients keep their call ledger at ElevenLabs; without this the
  // chart would be empty for them no matter how many calls came in. No-op,
  // and never throwing, for everyone else.
  await syncElevenLabsVoiceUsage(clientId);

  const settings = await loadSettings(clientId);
  const supabase = createServiceClient();

  const windowStart = new Date(Date.now() - (days - 1) * 86_400_000);
  windowStart.setUTCHours(0, 0, 0, 0);
  // The KPI epoch hides pre-go-live test traffic from the tiles. The chart
  // sits beside them, so it has to agree — two numbers for the same fortnight
  // that disagree is worse than either of them being wrong.
  const epoch = settings.kpiSince ? new Date(settings.kpiSince) : null;
  const since = epoch && epoch > windowStart ? epoch : windowStart;

  const { data } = await supabase
    .from("voice_usage")
    .select("started_at, duration_seconds")
    .eq("client_id", clientId)
    .gte("started_at", since.toISOString())
    .limit(5000);

  const buckets = new Map<string, CallDay>();
  for (let i = days - 1; i >= 0; i--) {
    const date = osloDay(new Date(Date.now() - i * 86_400_000).toISOString());
    const [, month, day] = date.split("-");
    buckets.set(date, { date, label: `${Number(day)}.${Number(month)}`, calls: 0, minutes: 0 });
  }

  for (const row of data ?? []) {
    const bucket = buckets.get(osloDay(row.started_at));
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.minutes += (row.duration_seconds ?? 0) / 60;
  }

  return [...buckets.values()].map((d) => ({ ...d, minutes: Math.round(d.minutes * 10) / 10 }));
}
