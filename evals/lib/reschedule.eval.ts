import { beforeEach, describe, expect, it, vi } from "vitest";

// The «endre booking»-flow: find_my_bookings + reschedule_booking. The
// properties under test mirror bookingScope.eval.ts — sandbox never touches
// Google even with a calendar connected — plus the ones specific to moving a
// booking: only hzAgent events are visible/movable, the target slot gets the
// same validation as a fresh booking, and the phone number must match.

const blobStore = new Map<string, string>();

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (key: string) => {
    if (!blobStore.has(key)) return null;
    return {
      statusCode: 200,
      stream: new Response(blobStore.get(key)!).body,
    };
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
  return {
    ...actual,
    getServiceAccount: vi.fn(() => ({ client_email: "sa@test", private_key: "k" })),
    listEvents: vi.fn(async () => []),
    insertEvent: vi.fn(async () => ({ id: "gcal-event-id" })),
    getEvent: vi.fn(async () => ({ id: "gcal-event-id" })),
    deleteEvent: vi.fn(async () => undefined),
    patchEvent: vi.fn(async () => ({ id: "gcal-event-id" })),
  };
});

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return {
    ...actual,
    loadSettings: vi.fn(async () => ({
      ...actual.DEFAULT_SETTINGS,
      calendarId: "real-calendar@handzon.no",
      calendarName: "Handz On Strømmen",
      daysAhead: 3,
    })),
  };
});

import { listEvents, insertEvent, patchEvent, osloToUTC } from "@/lib/google-calendar";
import { bookSlot, findBookingsByPhone, loadSlots, rescheduleBooking } from "@/lib/slots";
import { execBookingTool } from "@/lib/bookingTools";

const CLIENT = "11111111-2222-3333-4444-555555555555";
const PHONE = "91787801";

beforeEach(() => {
  blobStore.clear();
  vi.mocked(listEvents).mockClear();
  vi.mocked(listEvents).mockResolvedValue([]);
  vi.mocked(insertEvent).mockClear();
  vi.mocked(patchEvent).mockClear();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

/** Two distinct unrestricted slots on the grid's LAST day — always in the
 *  future regardless of what time of day the test runs. */
async function twoFutureSlots() {
  const slots = await loadSlots(CLIENT, "sandbox");
  const lastDate = slots[slots.length - 1].date;
  const candidates = slots.filter((s) => s.date === lastDate && !s.serviceKeyword);
  expect(candidates.length).toBeGreaterThanOrEqual(2);
  return [candidates[0], candidates[1]] as const;
}

describe("find_my_bookings (sandbox)", () => {
  it("finds the booking by phone, tolerating spaced formatting, without touching Google", async () => {
    const [slot] = await twoFutureSlots();
    await bookSlot(CLIENT, slot.id, "Sabah", PHONE, "Motorvask", "sandbox");

    const found = await execBookingTool(
      CLIENT,
      "find_my_bookings",
      { customer_phone: "917 87 801" },
      "sandbox",
    );
    expect(found.success).toBe(true);
    const bookings = found.bookings as { date: string; time: string; service: string }[];
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ date: slot.date, time: slot.time, service: "Motorvask" });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("finds a booking made with a bare 8-digit number via +47 caller ID", async () => {
    const [slot] = await twoFutureSlots();
    await bookSlot(CLIENT, slot.id, "Leonard", "983 61 774", "Polering", "sandbox");

    // What the phone bridge injects from the SIP From header.
    const found = await findBookingsByPhone(CLIENT, "+47 983 61 774", "sandbox");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ date: slot.date, time: slot.time, service: "Polering" });
  });

  it("finds a booking stored WITH the +47 prefix via a dictated 8-digit number", async () => {
    const [slot] = await twoFutureSlots();
    // A booking made through the «nummeret du ringer fra»-flow stores the
    // caller ID verbatim, prefix included.
    await bookSlot(CLIENT, slot.id, "Leonard", "+4798361774", "Polering", "sandbox");

    const found = await findBookingsByPhone(CLIENT, "98361774", "sandbox");
    expect(found).toHaveLength(1);
  });

  it("does not strip 47 from an 8-digit number that merely starts with 47", async () => {
    const [slot] = await twoFutureSlots();
    await bookSlot(CLIENT, slot.id, "Kari", "47836177", "Polering", "sandbox");

    // 478361xx and 8361xx.. must not collide.
    expect(await findBookingsByPhone(CLIENT, "47836177", "sandbox")).toHaveLength(1);
    expect(await findBookingsByPhone(CLIENT, "83611774", "sandbox")).toHaveLength(0);
  });

  it("returns an empty list (not an error) for an unknown number", async () => {
    const found = await execBookingTool(
      CLIENT,
      "find_my_bookings",
      { customer_phone: "00000000" },
      "sandbox",
    );
    expect(found.success).toBe(true);
    expect(found.bookings).toEqual([]);
  });
});

describe("reschedule_booking (sandbox)", () => {
  it("moves the booking to the new slot without touching Google", async () => {
    const [from, to] = await twoFutureSlots();
    await bookSlot(CLIENT, from.id, "Sabah", PHONE, "Motorvask", "sandbox");

    const moved = await execBookingTool(
      CLIENT,
      "reschedule_booking",
      {
        date: from.date,
        time: from.time,
        customer_phone: "+47 917 87 801",
        new_date: to.date,
        new_time: to.time,
      },
      "sandbox",
    );
    expect(moved.success).toBe(true);
    expect(moved.booking).toMatchObject({ date: to.date, time: to.time, service: "Motorvask" });

    const after = await loadSlots(CLIENT, "sandbox");
    expect(after.find((s) => s.id === from.id)?.bookedCount).toBe(0);
    expect(after.find((s) => s.id === to.id)?.bookedCount).toBe(1);
    expect(insertEvent).not.toHaveBeenCalled();
    expect(patchEvent).not.toHaveBeenCalled();
  });

  it("rejects a phone number that does not match the booking", async () => {
    const [from, to] = await twoFutureSlots();
    await bookSlot(CLIENT, from.id, "Sabah", PHONE, "Motorvask", "sandbox");

    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: "22222222", newDate: to.date, newTime: to.time },
      "sandbox",
    );
    expect(out).toEqual({ ok: false, error: "Fant ingen booking på det tidspunktet og nummeret." });
  });

  it("rejects a target slot that is not on the grid", async () => {
    const [from] = await twoFutureSlots();
    await bookSlot(CLIENT, from.id, "Sabah", PHONE, "Motorvask", "sandbox");

    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: PHONE, newDate: "2099-01-01", newTime: "09:30" },
      "sandbox",
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/Fant ikke den nye timen/);
  });

  it("rejects a full target slot", async () => {
    const [from, to] = await twoFutureSlots();
    await bookSlot(CLIENT, from.id, "Sabah", PHONE, "Motorvask", "sandbox");
    for (let i = 0; i < to.capacity; i++) {
      const b = await bookSlot(CLIENT, to.id, `Kunde ${i}`, `4444444${i}`, "Vask utvendig", "sandbox");
      expect(b.ok).toBe(true);
    }

    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: PHONE, newDate: to.date, newTime: to.time },
      "sandbox",
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/full/);
  });

  it("enforces the target slot's service restriction", async () => {
    const slots = await loadSlots(CLIENT, "sandbox");
    const restricted = slots.find((s) => s.serviceKeyword);
    expect(restricted).toBeTruthy();
    const [from] = await twoFutureSlots();
    await bookSlot(CLIENT, from.id, "Sabah", PHONE, "Motorvask", "sandbox");

    const out = await rescheduleBooking(
      CLIENT,
      {
        date: from.date,
        time: from.time,
        customerPhone: PHONE,
        newDate: restricted!.date,
        newTime: restricted!.time,
      },
      "sandbox",
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(new RegExp(restricted!.serviceKeyword!));
  });

  it("rejects a no-op move to the same slot", async () => {
    const [from] = await twoFutureSlots();
    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: PHONE, newDate: from.date, newTime: from.time },
      "sandbox",
    );
    expect(out.ok).toBe(false);
  });
});

describe("live scope against the connected calendar", () => {
  it("find_my_bookings lists only hzAgent events matching the phone", async () => {
    const slots = await loadSlots(CLIENT, "sandbox");
    const slot = slots[slots.length - 1];
    const startISO = osloToUTC(slot.date, slot.time).toISOString();
    const endISO = osloToUTC(slot.date, slot.endTime).toISOString();
    vi.mocked(listEvents).mockResolvedValue([
      {
        id: "evt-agent",
        start: { dateTime: startISO },
        end: { dateTime: endISO },
        extendedProperties: {
          private: { hzAgent: "1", customerName: "Sabah", customerPhone: PHONE, service: "Motorvask" },
        },
      },
      // Synced in from the store's other systems — must be invisible here.
      {
        id: "evt-external",
        summary: "Polering – walk-in",
        start: { dateTime: startISO },
        end: { dateTime: endISO },
      },
    ]);

    const found = await findBookingsByPhone(CLIENT, "917 87 801", "live");
    expect(found).toEqual([
      { date: slot.date, time: slot.time, service: "Motorvask", customerName: "Sabah" },
    ]);
  });

  it("reschedule_booking patches the event's start/end in place", async () => {
    const grid = await loadSlots(CLIENT, "sandbox");
    const lastDate = grid[grid.length - 1].date;
    const candidates = grid.filter((s) => s.date === lastDate && !s.serviceKeyword);
    const [from, to] = [candidates[0], candidates[1]];
    vi.mocked(listEvents).mockResolvedValue([
      {
        id: "evt-agent",
        start: { dateTime: osloToUTC(from.date, from.time).toISOString() },
        end: { dateTime: osloToUTC(from.date, from.endTime).toISOString() },
        extendedProperties: {
          private: { hzAgent: "1", customerName: "Sabah", customerPhone: PHONE, service: "Motorvask" },
        },
      },
    ]);

    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: PHONE, newDate: to.date, newTime: to.time },
      "live",
    );
    expect(out.ok).toBe(true);
    expect(patchEvent).toHaveBeenCalledWith("real-calendar@handzon.no", "evt-agent", {
      start: { dateTime: `${to.date}T${to.time}:00`, timeZone: "Europe/Oslo" },
      end: { dateTime: `${to.date}T${to.endTime}:00`, timeZone: "Europe/Oslo" },
    });
  });

  it("refuses to move an event the agent did not create, even on a matching time", async () => {
    const grid = await loadSlots(CLIENT, "sandbox");
    const lastDate = grid[grid.length - 1].date;
    const candidates = grid.filter((s) => s.date === lastDate && !s.serviceKeyword);
    const [from, to] = [candidates[0], candidates[1]];
    vi.mocked(listEvents).mockResolvedValue([
      {
        id: "evt-external",
        summary: "Polering – walk-in",
        start: { dateTime: osloToUTC(from.date, from.time).toISOString() },
        end: { dateTime: osloToUTC(from.date, from.endTime).toISOString() },
      },
    ]);

    const out = await rescheduleBooking(
      CLIENT,
      { date: from.date, time: from.time, customerPhone: PHONE, newDate: to.date, newTime: to.time },
      "live",
    );
    expect(out).toEqual({ ok: false, error: "Fant ingen booking på det tidspunktet og nummeret." });
    expect(patchEvent).not.toHaveBeenCalled();
  });
});
