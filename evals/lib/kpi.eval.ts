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
  // The 890-instead-of-1590 dashboard bug, pinned: the agent phrased the
  // service "Premium inn- og utvendig vask" while the price list says
  // "vask ut- og innvendig premium". Every token of an entry must appear in
  // the booking string, and the token "ut-" does not occur in "inn- og
  // utvendig" — so the combined-wash entries failed and the fallthrough hit
  // "vask utvendig premium". Alias entries for the spoken word order are the
  // fix, and they must sit BEFORE the exterior-only entries (order is
  // precedence). The agents are also told to copy names verbatim from the
  // price list, but data must not depend on prompts being obeyed.
  it("matches the spoken word order «inn- og utvendig» via its alias entries", () => {
    const prices = [
      { match: "inn- og utvendig premium", priceNok: 1590 },
      { match: "inn- og utvendig", priceNok: 1090 },
      { match: "vask ut- og innvendig premium", priceNok: 1590 },
      { match: "vask ut- og innvendig", priceNok: 1090 },
      { match: "vask utvendig premium", priceNok: 890 },
      { match: "vask utvendig", priceNok: 590 },
    ];
    expect(priceForService("Premium inn- og utvendig vask — Tesla Model Y, EE 53545", prices)).toBe(1590);
    expect(priceForService("Vask ut- og innvendig Premium — VW Golf", prices)).toBe(1590);
    expect(priceForService("Vask ut- og innvendig Basic", prices)).toBe(1090);
    expect(priceForService("Vask utvendig Premium", prices)).toBe(890);
  });

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

// The non-destructive reset: kpiSince is the epoch, everything before it is
// invisible to the tiles but stays in the database (admin cost figures).
describe("kpiSince epoch", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, servicePrices: [{ match: "vask", priceNok: 590 }], kpiSince: "2026-08-15T12:00:00.000Z" };
  const now = new Date("2026-08-19T12:00:00Z");

  it("bookings and calls before the epoch vanish from both periods", () => {
    const k = computeKpis({
      now, settings: s, monthlyPriceNok: null,
      bookings: [
        { date: "2026-08-24", time: "08:00", service: "Vask", bookedAt: "2026-08-10T09:00:00.000Z" }, // booket før reset
        { date: "2026-08-24", time: "09:00", service: "Vask", bookedAt: "2026-08-16T09:00:00.000Z" }, // etter
      ],
      calls: [
        { startedAt: "2026-08-14T10:00:00Z", durationSeconds: 100 }, // før
        { startedAt: "2026-08-18T10:00:00Z", durationSeconds: 60 }, // etter
      ],
    });
    expect(k.total.bookings).toBe(1);
    expect(k.total.valueNok).toBe(590);
    expect(k.total.calls).toBe(1);
    expect(k.total.callSeconds).toBe(60);
  });

  it("no epoch set counts everything, and showKpis=false flips show", () => {
    const all = computeKpis({ now, settings: { ...s, kpiSince: undefined }, monthlyPriceNok: null, bookings: [], calls: [{ startedAt: "2020-01-01T00:00:00Z", durationSeconds: 5 }] });
    expect(all.total.calls).toBe(1);
    expect(all.show).toBe(true);
    const hidden = computeKpis({ now, settings: { ...s, showKpis: false }, monthlyPriceNok: null, bookings: [], calls: [] });
    expect(hidden.show).toBe(false);
  });
});
