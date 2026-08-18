import { describe, expect, it } from "vitest";
import { computeKpis, isOutsideHours, osloMonth, priceForService } from "@/lib/kpi";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

// The KPI math the client's renewal decision leans on. The contract: prices
// come from the client's OWN ordered list, unmatched bookings are counted
// "uten fastpris" (never guessed), month bucketing is Oslo-calendar, and the
// ROI multiple only exists when a subscription price is actually set.

const HANDZON_PRICES: Settings["servicePrices"] = [
  { match: "lakkrens pro", priceNok: 4990 },
  { match: "lakkrens", priceNok: 3990 },
  { match: "polering pro", priceNok: 3490 },
  { match: "polering", priceNok: 2390 },
  { match: "vask utvendig premium", priceNok: 890 },
  { match: "vask utvendig", priceNok: 590 },
];

describe("priceForService", () => {
  it("first match wins, so specific entries must beat generic ones", () => {
    expect(priceForService("Lakkrens pluss Polering Pro — VW Golf", HANDZON_PRICES)).toBe(4990);
    expect(priceForService("Lakkrens pluss Polering Basic", HANDZON_PRICES)).toBe(3990);
    expect(priceForService("Polering Pro — Tesla Model Y", HANDZON_PRICES)).toBe(3490);
    expect(priceForService("Vask utvendig Premium — VW Golf, AB 12345", HANDZON_PRICES)).toBe(890);
    expect(priceForService("Vask utvendig Basic — VW Golf", HANDZON_PRICES)).toBe(590);
  });

  it("tokens all have to appear — different word order still matches", () => {
    expect(priceForService("Premium vask utvendig", HANDZON_PRICES)).toBe(890);
  });

  it("no match, no list, no service -> null, never a guess", () => {
    expect(priceForService("Service — VW Passat, kilometerstand 145 000", HANDZON_PRICES)).toBeNull();
    expect(priceForService("Vask utvendig", undefined)).toBeNull();
    expect(priceForService(undefined, HANDZON_PRICES)).toBeNull();
  });
});

describe("isOutsideHours", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, openTime: "08:00", closeTime: "16:30", closedWeekdays: [0, 6] };

  it("inside opening hours on a weekday is inside", () => {
    // 2026-08-19 is a Wednesday; 10:00 Oslo summer = 08:00Z.
    expect(isOutsideHours("2026-08-19T08:00:00Z", s)).toBe(false);
  });

  it("evening, before opening, and closed weekdays are outside", () => {
    expect(isOutsideHours("2026-08-19T17:00:00Z", s)).toBe(true); // 19:00 Oslo
    expect(isOutsideHours("2026-08-19T04:30:00Z", s)).toBe(true); // 06:30 Oslo
    expect(isOutsideHours("2026-08-22T09:00:00Z", s)).toBe(true); // Saturday
  });

  it("the Oslo/UTC boundary does not leak calls into the wrong bucket", () => {
    // 22:30Z Wednesday = 00:30 Oslo THURSDAY — outside by time, weekday open.
    expect(isOutsideHours("2026-08-19T22:30:00Z", s)).toBe(true);
  });
});

describe("computeKpis", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, openTime: "08:00", closeTime: "16:30", closedWeekdays: [0, 6], servicePrices: HANDZON_PRICES };
  const now = new Date("2026-08-19T12:00:00Z");

  it("sums real prices per period and counts unpriced honestly", () => {
    const k = computeKpis({
      now,
      settings: s,
      monthlyPriceNok: 2990,
      bookings: [
        { date: "2026-08-24", time: "08:00", service: "Vask utvendig Premium — VW Golf" }, // 890, denne måneden
        { date: "2026-08-03", time: "10:00", service: "Polering Pro" }, // 3490, denne måneden
        { date: "2026-07-01", time: "10:00", service: "Vask utvendig Basic" }, // 590, kun totalt
        { date: "2026-08-10", time: "09:00", service: "Service — ukjent pris" }, // uten fastpris
      ],
      calls: [
        { startedAt: "2026-08-19T08:00:00Z", durationSeconds: 120 }, // innenfor
        { startedAt: "2026-08-19T17:00:00Z", durationSeconds: 60 }, // utenfor
        { startedAt: "2026-07-06T08:00:00Z", durationSeconds: 300 }, // forrige måned (mandag, innenfor)
      ],
    });

    expect(k.month).toEqual({
      bookings: 3, valueNok: 890 + 3490, unpriced: 1,
      calls: 2, callSeconds: 180, callsOutsideHours: 1,
    });
    expect(k.total).toEqual({
      bookings: 4, valueNok: 890 + 3490 + 590, unpriced: 1,
      calls: 3, callSeconds: 480, callsOutsideHours: 1,
    });
    // ROI uses the MONTH value: 4380/2990 = 1.464... -> 1.5
    expect(k.roiMultiple).toBe(1.5);
  });

  it("no subscription price -> no ROI multiple at all", () => {
    const k = computeKpis({ now, settings: s, monthlyPriceNok: null, bookings: [], calls: [] });
    expect(k.roiMultiple).toBeNull();
  });

  it("osloMonth buckets by Oslo calendar, not UTC", () => {
    // 23:30Z July 31 = 01:30 Oslo August 1.
    expect(osloMonth(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08");
  });
});
