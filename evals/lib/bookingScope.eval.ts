import { beforeEach, describe, expect, it, vi } from "vitest";

// The property under test is a safety one: a "sandbox" booking must never
// reach Google Calendar, EVEN WHEN the client has a real calendar connected.
// That's the whole reason the scope exists — it lets the voice agent's booking
// flow be exercised against Handz On's live setup without writing test
// bookings into the calendar their staff actually works from.
//
// So the Google Calendar module is mocked with spies that fail the test if
// they're ever touched in sandbox mode, and Blob storage is an in-memory map.

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
    // A connected calendar: calendarConnected() needs both a calendarId in
    // settings and a service account here.
    getServiceAccount: vi.fn(() => ({ client_email: "sa@test", private_key: "k" })),
    listEvents: vi.fn(async () => []),
    insertEvent: vi.fn(async () => ({ id: "gcal-event-id" })),
    getEvent: vi.fn(async () => ({ id: "gcal-event-id", extendedProperties: { private: { hzAgent: "1" } } })),
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
      // Real calendar attached — sandbox must ignore it entirely.
      calendarId: "real-calendar@handzon.no",
      calendarName: "Handz On Strømmen",
      daysAhead: 3,
    })),
  };
});

import { insertEvent, listEvents, patchEvent } from "@/lib/google-calendar";
import {
  appendBookingNote,
  bookSlot,
  cancelBooking,
  clearSandboxBookings,
  loadSlots,
} from "@/lib/slots";
import { execBookingTool } from "@/lib/bookingTools";

const CLIENT = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  blobStore.clear();
  vi.mocked(insertEvent).mockClear();
  vi.mocked(listEvents).mockClear();
  vi.mocked(patchEvent).mockClear();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

/** First slot id the demo grid offers on a given day, e.g. 2026-07-20-0930. */
async function firstSandboxSlotId(): Promise<string> {
  const slots = await loadSlots(CLIENT, "sandbox");
  expect(slots.length).toBeGreaterThan(0);
  return slots[0].id;
}

describe("sandbox scope never reaches Google Calendar", () => {
  it("loadSlots(sandbox) does not read the connected calendar", async () => {
    const slots = await loadSlots(CLIENT, "sandbox");
    expect(slots.length).toBeGreaterThan(0);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("bookSlot(sandbox) writes to the sandbox store, not the calendar", async () => {
    const slotId = await firstSandboxSlotId();
    const result = await bookSlot(CLIENT, slotId, "Test Testesen", "99999999", "Vask utvendig", "sandbox");

    expect(result.ok).toBe(true);
    expect(insertEvent).not.toHaveBeenCalled();
    // ...and it landed in the sandbox-specific key, not the shared demo one.
    expect([...blobStore.keys()]).toEqual([`${CLIENT}/voice-sandbox-bookings.json`]);
  });

  it("clearSandboxBookings wipes the sandbox store and never touches Google", async () => {
    const slotId = await firstSandboxSlotId();
    await bookSlot(CLIENT, slotId, "En", "11111111", "Vask utvendig", "sandbox");
    await bookSlot(CLIENT, slotId, "To", "22222222", "Vask utvendig", "sandbox");

    const { removed } = await clearSandboxBookings(CLIENT);
    expect(removed).toBe(2);

    const after = await loadSlots(CLIENT, "sandbox");
    expect(after.every((s) => s.bookedCount === 0)).toBe(true);
    expect(insertEvent).not.toHaveBeenCalled();
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("cancelBooking(sandbox) removes from the sandbox store without touching the calendar", async () => {
    const slotId = await firstSandboxSlotId();
    const booked = await bookSlot(CLIENT, slotId, "Test", "99999999", "Vask utvendig", "sandbox");
    expect(booked.ok).toBe(true);
    const bookingId = booked.ok ? booked.slot.bookings[0].id : "";

    const cancelled = await cancelBooking(CLIENT, bookingId, "sandbox");
    expect(cancelled.ok).toBe(true);

    const after = await loadSlots(CLIENT, "sandbox");
    expect(after.find((s) => s.id === slotId)?.bookedCount).toBe(0);
    expect(insertEvent).not.toHaveBeenCalled();
  });
});

describe("live scope still uses the connected calendar", () => {
  it("loadSlots(live) reads Google Calendar", async () => {
    await loadSlots(CLIENT, "live");
    expect(listEvents).toHaveBeenCalled();
  });

  it("defaults to live when no scope is passed — the chat bot's path", async () => {
    await loadSlots(CLIENT);
    expect(listEvents).toHaveBeenCalled();
  });
});

describe("the two stores are isolated from each other", () => {
  it("a sandbox booking is invisible to the live demo store", async () => {
    const slotId = await firstSandboxSlotId();
    await bookSlot(CLIENT, slotId, "Sandbox Kunde", "11111111", "Vask utvendig", "sandbox");

    // The live store is a different blob key and was never written.
    expect(blobStore.has(`${CLIENT}/demo-bookings.json`)).toBe(false);
    expect(blobStore.has(`${CLIENT}/voice-sandbox-bookings.json`)).toBe(true);
  });
});

describe("execBookingTool honours the scope it is given", () => {
  it("books into the sandbox without calling the calendar", async () => {
    const slots = await execBookingTool(CLIENT, "get_available_demo_slots", { date: null, near_time: null }, "sandbox");
    const first = (slots.available_slots as { date: string; time: string }[])[0];
    expect(first).toBeTruthy();

    const booked = await execBookingTool(
      CLIENT,
      "book_demo_slot",
      {
        date: first.date,
        time: first.time,
        customer_name: "Test Testesen",
        customer_phone: "99999999",
        service: "Vask utvendig",
      },
      "sandbox",
    );

    expect(booked.success).toBe(true);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("appends a post-booking note in the sandbox without touching Google", async () => {
    const slotId = await firstSandboxSlotId();
    const booked = await bookSlot(CLIENT, slotId, "Sabah Ali", "91787801", "Motorvask", "sandbox");
    expect(booked.ok).toBe(true);
    const slot = booked.ok ? booked.slot : null;

    // Spaced phone formatting must still match the stored booking.
    const noted = await execBookingTool(
      CLIENT,
      "add_booking_note",
      {
        date: slot!.date,
        time: slot!.time,
        customer_phone: "917 87 801",
        note: "Kunden ønsker vurdering/pris av PDR/bulk ved levering",
      },
      "sandbox",
    );

    expect(noted.success).toBe(true);
    expect(noted.service).toBe("Motorvask + Kunden ønsker vurdering/pris av PDR/bulk ved levering");
    expect(patchEvent).not.toHaveBeenCalled();
    expect(listEvents).not.toHaveBeenCalled();

    // The note survived into the store — and re-adding it doesn't stack.
    const again = await appendBookingNote(
      CLIENT,
      slot!.date,
      slot!.time,
      "91787801",
      "Kunden ønsker vurdering/pris av PDR/bulk ved levering",
      "sandbox",
    );
    expect(again).toEqual({
      ok: true,
      service: "Motorvask + Kunden ønsker vurdering/pris av PDR/bulk ved levering",
    });
  });

  it("fails cleanly when no booking matches the note's date/time/phone", async () => {
    const out = await execBookingTool(
      CLIENT,
      "add_booking_note",
      { date: "2026-01-01", time: "09:30", customer_phone: "00000000", note: "PDR" },
      "sandbox",
    );
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/Fant ingen booking/);
  });

  it("append note in live scope patches the matching hzAgent calendar event", async () => {
    vi.mocked(listEvents).mockResolvedValueOnce([
      {
        id: "evt-1",
        start: { dateTime: "2026-08-01T14:30:00+02:00" },
        extendedProperties: {
          private: {
            hzAgent: "1",
            customerName: "Sabah Ali",
            customerPhone: "91787801",
            service: "Motorvask",
          },
        },
      },
    ]);

    const result = await appendBookingNote(
      CLIENT,
      "2026-08-01",
      "14:30",
      "917 87 801",
      "Kunden ønsker vurdering/pris av PDR/bulk",
      "live",
    );

    expect(result).toEqual({
      ok: true,
      service: "Motorvask + Kunden ønsker vurdering/pris av PDR/bulk",
    });
    expect(patchEvent).toHaveBeenCalledWith(
      "real-calendar@handzon.no",
      "evt-1",
      expect.objectContaining({
        summary: "Motorvask + Kunden ønsker vurdering/pris av PDR/bulk – Sabah Ali",
        extendedProperties: {
          private: expect.objectContaining({
            hzAgent: "1",
            service: "Motorvask + Kunden ønsker vurdering/pris av PDR/bulk",
          }),
        },
      }),
    );
  });

  it("returns a structured error rather than throwing on an unknown tool", async () => {
    const out = await execBookingTool(CLIENT, "no_such_tool", {}, "sandbox");
    expect(out.error).toMatch(/Ukjent verktøy/);
  });

  it("refuses a booking that is missing required fields", async () => {
    const out = await execBookingTool(
      CLIENT,
      "book_demo_slot",
      { date: "2026-07-20", time: "09:30" },
      "sandbox",
    );
    expect(out.success).toBe(false);
  });
});
