import { beforeEach, describe, expect, it, vi } from "vitest";

// The chart on the client dashboard sits beside the KPI tiles, so what it
// counts has to agree with them: this client's calls only, the KPI epoch
// respected, and every day in the window present — a gap reads as broken,
// a zero reads as a quiet Sunday.

const { rows, settings, sync } = vi.hoisted(() => ({
  rows: { data: [] as { started_at: string; duration_seconds: number }[] },
  settings: { value: {} as Record<string, unknown> },
  sync: vi.fn(async () => {}),
}));

const filters: Record<string, unknown> = {};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      filters.table = table;
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        gte: (col: string, val: unknown) => {
          filters.gte = val;
          return chain;
        },
        limit: async () => ({ data: rows.data }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/settings", () => ({ loadSettings: async () => settings.value }));
vi.mock("@/lib/voiceDemo/elevenlabsUsage", () => ({ syncElevenLabsVoiceUsage: sync }));

import { getClientCallActivity } from "@/lib/callActivity";

const CLIENT = "9c17e3d8-0fef-41d5-bb0b-7abcd7741029";
const daysAgo = (n: number, hour = 12) => {
  const d = new Date(Date.now() - n * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

beforeEach(() => {
  rows.data = [];
  settings.value = {};
  sync.mockClear();
  for (const k of Object.keys(filters)) delete filters[k];
});

describe("per-day call activity", () => {
  it("returns every day in the window, oldest first, zeros included", async () => {
    const days = await getClientCallActivity(CLIENT, 14);
    expect(days).toHaveLength(14);
    expect(days.every((d) => d.calls === 0 && d.minutes === 0)).toBe(true);
    expect(new Date(days[0].date) < new Date(days[13].date)).toBe(true);
  });

  it("counts calls and sums minutes into the right day", async () => {
    rows.data = [
      { started_at: daysAgo(1), duration_seconds: 90 },
      { started_at: daysAgo(1), duration_seconds: 30 },
      { started_at: daysAgo(3), duration_seconds: 60 },
    ];
    const days = await getClientCallActivity(CLIENT, 14);
    const byLabel = Object.fromEntries(days.map((d) => [d.date, d]));
    const d1 = byLabel[days[12].date];
    expect(d1.calls).toBe(2);
    expect(d1.minutes).toBe(2); // 90s + 30s
    expect(byLabel[days[10].date].calls).toBe(1);
  });

  it("asks only for this client's rows", async () => {
    await getClientCallActivity(CLIENT, 14);
    expect(filters.table).toBe("voice_usage");
    expect(filters.client_id).toBe(CLIENT);
  });

  it("pulls the ElevenLabs ledger first, or a pilot client's chart stays empty", async () => {
    await getClientCallActivity(CLIENT, 14);
    expect(sync).toHaveBeenCalledWith(CLIENT);
  });

  it("starts at the KPI epoch when that is later than the window", async () => {
    const epoch = daysAgo(3, 0);
    settings.value = { kpiSince: epoch };
    await getClientCallActivity(CLIENT, 14);
    expect(filters.gte).toBe(epoch);
  });

  it("ignores an epoch older than the window — 14 days still means 14 days", async () => {
    settings.value = { kpiSince: daysAgo(90) };
    await getClientCallActivity(CLIENT, 14);
    expect(new Date(filters.gte as string) > new Date(daysAgo(15))).toBe(true);
  });

  it("rounds minutes to one decimal, so a tooltip never reads 3.7333", async () => {
    rows.data = [{ started_at: daysAgo(0), duration_seconds: 224 }];
    const days = await getClientCallActivity(CLIENT, 14);
    expect(days[13].minutes).toBe(3.7);
  });
});
