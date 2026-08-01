import { beforeEach, describe, expect, it, vi } from "vitest";

// Which weekdays the slot grid offers. The rule used to be hardcoded to
// "Sundays closed", which fit a shopping-centre client open six days a week —
// and quietly offered Saturday times to a car workshop that is closed on
// Saturdays. So the closed days are settings now, and this pins both the new
// behaviour and the default that every pre-existing client relies on.

const blobStore = new Map<string, string>();

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (key: string) => {
    if (!blobStore.has(key)) return null;
    return { statusCode: 200, stream: new Response(blobStore.get(key)!).body };
  }),
  put: vi.fn(async (key: string, body: string) => {
    blobStore.set(key, body);
    return { url: `https://blob.test/${key}` };
  }),
}));

vi.mock("@/lib/google-calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-calendar")>(
    "@/lib/google-calendar",
  );
  return { ...actual, getServiceAccount: vi.fn(() => ({ client_email: "sa@test", private_key: "k" })) };
});

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return { ...actual, loadSettings: vi.fn(async () => ({ ...actual.DEFAULT_SETTINGS })) };
});

import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/settings";
import { dashboardScope, loadSlots } from "@/lib/slots";

const CLIENT = "66666666-7777-8888-9999-000000000000";

/** Weekday numbers (0 = Sunday … 6 = Saturday) the grid offered. */
async function offeredWeekdays(patch: Partial<Settings>): Promise<Set<number>> {
  vi.mocked(loadSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, daysAhead: 14, ...patch });
  const slots = await loadSlots(CLIENT, "sandbox");
  // Parsed as UTC noon so the local timezone of whoever runs the tests can't
  // shift a date onto the neighbouring day.
  return new Set(slots.map((s) => new Date(`${s.date}T12:00:00Z`).getUTCDay()));
}

beforeEach(() => {
  blobStore.clear();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("closedWeekdays", () => {
  it("offers no Saturdays or Sundays when the shop is closed both days", async () => {
    const days = await offeredWeekdays({ closedWeekdays: [0, 6] });
    expect(days.has(6)).toBe(false);
    expect(days.has(0)).toBe(false);
    expect(days.size).toBe(5);
  });

  it("still offers Saturdays when the field is absent (pre-existing clients)", async () => {
    const days = await offeredWeekdays({});
    expect(days.has(6)).toBe(true);
    expect(days.has(0)).toBe(false);
  });

  it("offers nothing rather than looping forever when every day is closed", async () => {
    const days = await offeredWeekdays({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] });
    expect(days.size).toBe(0);
  });

  it("still offers daysAhead open days, not daysAhead calendar days", async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      daysAhead: 10,
      closedWeekdays: [0, 6],
    });
    const dates = new Set((await loadSlots(CLIENT, "sandbox")).map((s) => s.date));
    expect(dates.size).toBe(10);
  });
});

// Which calendar the dashboard opens on. Namsos has no calendar connected, so
// its only bookings are the voice agent's in the sandbox — opening on the real
// grid showed nothing at all and made a working agent look broken. The rule
// only ever downgrades: no existing client is moved ONTO the real calendar.
describe("dashboardScope", () => {
  const noCalendar = { ...DEFAULT_SETTINGS, calendarId: undefined };
  const connected = { ...DEFAULT_SETTINGS, calendarId: "shop@example.com" };

  it("downgrades to the sandbox when no calendar is connected", () => {
    expect(dashboardScope(noCalendar, "live")).toBe("sandbox");
  });

  it("keeps the real calendar for a viewer who opens on it and has one", () => {
    expect(dashboardScope(connected, "live")).toBe("live");
  });

  it("never upgrades a sandbox viewer onto the real calendar", () => {
    expect(dashboardScope(connected, "sandbox")).toBe("sandbox");
    expect(dashboardScope(noCalendar, "sandbox")).toBe("sandbox");
  });
});
