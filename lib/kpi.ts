// The dashboard KPI tiles: booking value in kroner, rescued calls, hours
// saved, ROI. The whole point is Hormozi's — the dashboard is a renewal
// machine, so the numbers must be in money — but the MATH must stay honest:
// prices come from the client's own price list (settings.servicePrices),
// value is always labeled an estimate, and a booking no price matches is
// counted "uten fastpris" rather than guessed.

import { createServiceClient } from "@/lib/supabase/service";
import { loadSettings, type Settings } from "@/lib/settings";
import { listAgentBookings, type AgentBookingRecord } from "@/lib/slots";

/** First entry whose every whitespace-separated token appears (lowercased,
 *  substring) in the service string wins — order in the list IS the
 *  precedence, so "polering pro" must sit before "polering". */
export function priceForService(
  service: string | undefined,
  prices: Settings["servicePrices"],
): number | null {
  if (!service || !prices?.length) return null;
  const hay = service.toLowerCase();
  for (const entry of prices) {
    const tokens = entry.match.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length && tokens.every((t) => hay.includes(t))) return entry.priceNok;
  }
  return null;
}

export type VoiceCall = { startedAt: string; durationSeconds: number };

export type KpiPeriod = {
  bookings: number;
  /** Sum of matched prices, integer NOK. */
  valueNok: number;
  /** Bookings no price entry matched — shown, never guessed at. */
  unpriced: number;
  calls: number;
  callSeconds: number;
  callsOutsideHours: number;
};

export type Kpis = {
  month: KpiPeriod;
  total: KpiPeriod;
  monthlyPriceNok: number | null;
  /** valueNok/monthlyPriceNok for the month, one decimal — null until both exist. */
  roiMultiple: number | null;
};

function osloParts(iso: string): { date: string; time: string; weekday: number } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("no-NO", {
    timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  // Noon-anchored weekday from the Oslo DATE, so UTC can't shift it.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, time, weekday };
}

/** Outside the shop's answering hours: a closed weekday, before open, or at/after close. */
export function isOutsideHours(startedAtIso: string, settings: Settings): boolean {
  const { time, weekday } = osloParts(startedAtIso);
  const closed = new Set(settings.closedWeekdays ?? [0]);
  if (closed.has(weekday)) return true;
  return time < settings.openTime || time >= settings.closeTime;
}

/** Current Oslo calendar month, "YYYY-MM". */
export function osloMonth(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit",
  }).format(now).slice(0, 7);
}

const emptyPeriod = (): KpiPeriod => ({
  bookings: 0, valueNok: 0, unpriced: 0, calls: 0, callSeconds: 0, callsOutsideHours: 0,
});

export function computeKpis(input: {
  bookings: AgentBookingRecord[];
  calls: VoiceCall[];
  settings: Settings;
  monthlyPriceNok: number | null;
  now?: Date;
}): Kpis {
  const month = osloMonth(input.now);
  const m = emptyPeriod();
  const t = emptyPeriod();

  for (const b of input.bookings) {
    const price = priceForService(b.service, input.settings.servicePrices);
    const inMonth = b.date.slice(0, 7) === month;
    for (const p of inMonth ? [m, t] : [t]) {
      p.bookings += 1;
      if (price === null) p.unpriced += 1;
      else p.valueNok += price;
    }
  }

  for (const c of input.calls) {
    const outside = isOutsideHours(c.startedAt, input.settings);
    const inMonth = osloParts(c.startedAt).date.slice(0, 7) === month;
    for (const p of inMonth ? [m, t] : [t]) {
      p.calls += 1;
      p.callSeconds += Math.max(0, c.durationSeconds);
      if (outside) p.callsOutsideHours += 1;
    }
  }

  const roiMultiple =
    input.monthlyPriceNok && input.monthlyPriceNok > 0 && m.valueNok > 0
      ? Math.round((m.valueNok / input.monthlyPriceNok) * 10) / 10
      : null;

  return { month: m, total: t, monthlyPriceNok: input.monthlyPriceNok, roiMultiple };
}

/** Assembles a client's KPIs. Tenancy is the CALLER's job (the route pins a
 *  client account to its own client) — this uses the service client because
 *  voice_usage is admin-select-only under RLS. */
export async function buildClientKpis(clientId: string): Promise<Kpis> {
  const supabase = createServiceClient();
  const [settings, bookings, usage, client] = await Promise.all([
    loadSettings(clientId),
    listAgentBookings(clientId),
    supabase
      .from("voice_usage")
      .select("started_at, duration_seconds")
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(5000),
    supabase.from("clients").select("monthly_price_nok").eq("id", clientId).maybeSingle(),
  ]);

  const calls: VoiceCall[] = (usage.data ?? []).map((r) => ({
    startedAt: r.started_at,
    durationSeconds: r.duration_seconds ?? 0,
  }));

  return computeKpis({
    bookings,
    calls,
    settings,
    monthlyPriceNok: client.data?.monthly_price_nok ?? null,
  });
}
