import fs from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import crypto from "crypto";
import {
  deleteEvent,
  getEvent,
  getServiceAccount,
  insertEvent,
  listEvents,
  patchEvent,
  osloParts,
  osloToUTC,
  osloToday,
  type GcalEvent,
} from "@/lib/google-calendar";
import { loadSettings, type Settings } from "@/lib/settings";

/* ------------------------------------------------------------------ */
/* Slot templates — the store's bookable-time grid, derived from       */
/* settings. Regular hourly slots (any service, capacity N) run from   */
/* openTime through lastSlotTime; one extra restricted slot sits at    */
/* lastSlotTime itself (e.g. 19:30 — exterior wash only, own capacity).*/
/* ------------------------------------------------------------------ */

type SlotTemplate = {
  time: string; // HH:MM start (Oslo)
  endTime: string; // HH:MM end (Oslo)
  capacity: number;
  /** If set, only services whose name contains this (case-insensitive) are bookable here. */
  serviceKeyword?: string;
};

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function slotTemplates(settings: Settings): SlotTemplate[] {
  const openMin = toMin(settings.openTime);
  const lastMin = toMin(settings.lastSlotTime);
  const templates: SlotTemplate[] = [];

  // Regular hourly slots: every slotMinutes, starting at openTime, while
  // the start time is at or before the special last-slot start.
  for (let t = openMin; t <= lastMin; t += settings.slotMinutes) {
    // Don't double-book the exact lastSlotTime as a "regular" slot too.
    if (t === lastMin) break;
    templates.push({
      time: toHHMM(t),
      endTime: toHHMM(t + settings.slotMinutes),
      capacity: settings.capacityPerSlot,
    });
  }
  // Final restricted slot (e.g. 19:30 — exterior wash only).
  templates.push({
    time: settings.lastSlotTime,
    endTime: toHHMM(lastMin + settings.slotMinutes),
    capacity: settings.lastSlotCapacity,
    serviceKeyword: settings.lastSlotServiceKeyword,
  });
  return templates;
}

function matchesServiceKeyword(service: string, keyword?: string): boolean {
  if (!keyword) return true;
  return service.toLowerCase().includes(keyword.toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function upcomingDates(daysAhead: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${osloToday()}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1); // first increment below lands on today
  while (dates.length < daysAhead) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() === 0) continue; // Sundays closed
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function calendarConnected(settings: Settings): boolean {
  return Boolean(settings.calendarId && getServiceAccount());
}

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type Booking = {
  /** Google Calendar event id (calendar mode) or a generated id (demo mode) — stable, used to cancel this specific booking. */
  id: string;
  /** True when the AI agent created this booking, vs. an event synced in from elsewhere on the connected calendar. Only agent bookings may be cancelled from the dashboard. */
  isAgentBooking: boolean;
  customerName?: string;
  customerPhone?: string;
  service?: string;
  bookedAt?: string;
};

export type SlotView = {
  id: string; // `${date}-${time.replace(':','')}`
  date: string;
  time: string;
  endTime: string;
  location: string;
  capacity: number;
  serviceKeyword?: string;
  bookings: Booking[];
  bookedCount: number;
  full: boolean;
  /** Convenience for older call sites: true when the slot has zero bookings. */
  booked: boolean;
  /** First booking's details, if any (dashboard "who's booked" convenience). */
  customerName?: string;
  customerPhone?: string;
  service?: string;
  bookedAt?: string;
};

function toSlotView(
  date: string,
  tmpl: SlotTemplate,
  location: string,
  bookings: Booking[]
): SlotView {
  const first = bookings[0];
  return {
    id: `${date}-${tmpl.time.replace(":", "")}`,
    date,
    time: tmpl.time,
    endTime: tmpl.endTime,
    location,
    capacity: tmpl.capacity,
    serviceKeyword: tmpl.serviceKeyword,
    bookings,
    bookedCount: bookings.length,
    full: bookings.length >= tmpl.capacity,
    booked: bookings.length > 0,
    customerName: first?.customerName,
    customerPhone: first?.customerPhone,
    service: first?.service,
    bookedAt: first?.bookedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Google Calendar mode                                                */
/* ------------------------------------------------------------------ */

async function fetchCalendarEvents(
  settings: Settings,
  dates: string[]
): Promise<GcalEvent[]> {
  const timeMin = osloToUTC(dates[0], "00:00").toISOString();
  const timeMax = osloToUTC(dates[dates.length - 1], "23:59").toISOString();
  return (await listEvents(settings.calendarId!, timeMin, timeMax)).filter(
    (e) =>
      e.status !== "cancelled" &&
      e.transparency !== "transparent" &&
      e.start?.dateTime &&
      e.end?.dateTime
  );
}

function bookingsInWindow(
  events: GcalEvent[],
  date: string,
  startTime: string,
  endTime: string
): Booking[] {
  const startMs = osloToUTC(date, startTime).getTime();
  const endMs = osloToUTC(date, endTime).getTime();
  return events
    .filter((e) => {
      // Count every busy event in this window, not just ones the agent
      // itself created — the store syncs bookings from other systems into
      // this same calendar, and the agent must never offer/double-book a
      // slot that's already taken there.
      const evStart = new Date(e.start!.dateTime!).getTime();
      const evEnd = new Date(e.end!.dateTime!).getTime();
      return evStart < endMs && evEnd > startMs;
    })
    .map((e) => {
      const priv = e.extendedProperties?.private ?? {};
      return {
        id: e.id,
        isAgentBooking: priv.hzAgent === "1",
        customerName: priv.customerName,
        customerPhone: priv.customerPhone,
        service: priv.service ?? e.summary ?? "Opptatt",
        bookedAt: priv.bookedAt,
      };
    });
}

async function calendarSlotViews(settings: Settings): Promise<SlotView[]> {
  const dates = upcomingDates(settings.daysAhead);
  const events = await fetchCalendarEvents(settings, dates);
  const templates = slotTemplates(settings);
  const views: SlotView[] = [];
  for (const date of dates) {
    for (const tmpl of templates) {
      const bookings = bookingsInWindow(events, date, tmpl.time, tmpl.endTime);
      views.push(toSlotView(date, tmpl, settings.locationName, bookings));
    }
  }
  return views;
}

async function calendarBook(
  settings: Settings,
  slotId: string,
  customerName: string,
  customerPhone: string,
  service: string
): Promise<{ ok: true; slot: SlotView } | { ok: false; error: string }> {
  const views = await calendarSlotViews(settings);
  const slot = views.find((s) => s.id === slotId);
  if (!slot) return { ok: false, error: "Fant ikke denne timen." };
  if (slot.full) {
    return {
      ok: false,
      error: `Denne timen er full (maks ${slot.capacity} samtidige bookinger). Velg et annet tidspunkt.`,
    };
  }
  if (!matchesServiceKeyword(service, slot.serviceKeyword)) {
    return {
      ok: false,
      error: `Klokken ${slot.time} kan vi kun ta imot tjenester som inkluderer «${slot.serviceKeyword}». Velg et tidligere tidspunkt for andre tjenester.`,
    };
  }

  const bookedAt = new Date().toISOString();
  const event = await insertEvent(settings.calendarId!, {
    summary: `${service} – ${customerName}`,
    description: `Booket av AI-chatbot.\nKunde: ${customerName}\nTelefon: ${customerPhone}\nTjeneste: ${service}`,
    start: { dateTime: `${slot.date}T${slot.time}:00`, timeZone: "Europe/Oslo" },
    end: { dateTime: `${slot.date}T${slot.endTime}:00`, timeZone: "Europe/Oslo" },
    extendedProperties: {
      private: { hzAgent: "1", customerName, customerPhone, service, bookedAt },
    },
  });
  if (!event.id) return { ok: false, error: "Kalenderen avviste bookingen." };

  const bookings = [
    ...slot.bookings,
    { id: event.id, isAgentBooking: true, customerName, customerPhone, service, bookedAt },
  ];
  return {
    ok: true,
    slot: toSlotView(
      slot.date,
      { time: slot.time, endTime: slot.endTime, capacity: slot.capacity, serviceKeyword: slot.serviceKeyword },
      slot.location,
      bookings
    ),
  };
}

async function calendarCancel(
  settings: Settings,
  bookingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let event: GcalEvent;
  try {
    event = await getEvent(settings.calendarId!, bookingId);
  } catch {
    return { ok: false, error: "Fant ikke denne avtalen." };
  }
  // Re-verify server-side rather than trusting the caller: only bookings the
  // agent itself created may be deleted from the dashboard. Anything else on
  // the connected calendar (synced in from the store's other systems, or a
  // manual entry) is out of bounds here.
  if (event.extendedProperties?.private?.hzAgent !== "1") {
    return {
      ok: false,
      error: "Denne avtalen er ikke laget av boten og kan ikke slettes herfra.",
    };
  }
  await deleteEvent(settings.calendarId!, bookingId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Demo mode (Vercel Blob / local file) — used until a calendar is     */
/* connected in the dashboard. Stores a flat list of bookings; slot     */
/* templates are always regenerated fresh from settings.               */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Which booking store a call operates against.
 *
 * "live"    — the client's real setup: their connected Google Calendar if one
 *             is attached, otherwise the shared demo store. This is what the
 *             website chat bot always uses.
 * "sandbox" — a separate, isolated fake calendar that NEVER touches Google,
 *             even when a real calendar is connected. Used to exercise the
 *             voice agent's booking end-to-end without putting test bookings
 *             in front of the business (see Settings.voiceBookingMode).
 *
 * The two stores are deliberately different Blob keys, so a sandbox booking
 * can never be mistaken for — or collide with — a real one.
 */
export type BookingScope = "live" | "sandbox";

const storeName = (scope: BookingScope) =>
  scope === "sandbox" ? "voice-sandbox-bookings.json" : "demo-bookings.json";

const bookingsFile = (clientId: string, scope: BookingScope) =>
  path.join(DATA_DIR, clientId, storeName(scope));
const bookingsBlobPath = (clientId: string, scope: BookingScope) =>
  `${clientId}/${storeName(scope)}`;

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

type DemoBooking = Booking & { slotId: string; date: string; time: string };

async function demoReadBookings(clientId: string, scope: BookingScope): Promise<DemoBooking[]> {
  let raw: DemoBooking[];
  try {
    if (blobConfigured()) {
      const result = await get(bookingsBlobPath(clientId, scope), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return [];
      raw = JSON.parse(await new Response(result.stream).text()) as DemoBooking[];
    } else if (fs.existsSync(bookingsFile(clientId, scope))) {
      raw = JSON.parse(fs.readFileSync(bookingsFile(clientId, scope), "utf-8"));
    } else {
      return [];
    }
  } catch {
    return [];
  }
  // Backfill id/isAgentBooking for records written before those fields
  // existed — every demo booking was always agent-made (this store has no
  // other writer), so the flag is unconditionally true.
  return raw.map((b) => ({
    ...b,
    id: b.id ?? `${b.slotId}-${b.bookedAt ?? crypto.randomUUID()}`,
    isAgentBooking: true,
  }));
}

async function demoWriteBookings(clientId: string, scope: BookingScope, bookings: DemoBooking[]) {
  if (blobConfigured()) {
    await put(bookingsBlobPath(clientId, scope), JSON.stringify(bookings, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(bookingsFile(clientId, scope)), { recursive: true });
    fs.writeFileSync(bookingsFile(clientId, scope), JSON.stringify(bookings, null, 2));
  }
}

async function demoSlotViews(
  clientId: string,
  settings: Settings,
  scope: BookingScope,
): Promise<SlotView[]> {
  const dates = upcomingDates(settings.daysAhead);
  const templates = slotTemplates(settings);
  const allBookings = await demoReadBookings(clientId, scope);
  const views: SlotView[] = [];
  for (const date of dates) {
    for (const tmpl of templates) {
      const id = `${date}-${tmpl.time.replace(":", "")}`;
      const bookings = allBookings.filter((b) => b.slotId === id);
      views.push(toSlotView(date, tmpl, settings.locationName, bookings));
    }
  }
  return views;
}

async function demoBook(
  clientId: string,
  settings: Settings,
  slotId: string,
  customerName: string,
  customerPhone: string,
  service: string,
  scope: BookingScope,
): Promise<{ ok: true; slot: SlotView } | { ok: false; error: string }> {
  const views = await demoSlotViews(clientId, settings, scope);
  const slot = views.find((s) => s.id === slotId);
  if (!slot) return { ok: false, error: "Fant ikke denne timen." };
  if (slot.full) {
    return {
      ok: false,
      error: `Denne timen er full (maks ${slot.capacity} samtidige bookinger). Velg et annet tidspunkt.`,
    };
  }
  if (!matchesServiceKeyword(service, slot.serviceKeyword)) {
    return {
      ok: false,
      error: `Klokken ${slot.time} kan vi kun ta imot tjenester som inkluderer «${slot.serviceKeyword}». Velg et tidligere tidspunkt for andre tjenester.`,
    };
  }

  const bookedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const all = await demoReadBookings(clientId, scope);
  all.push({
    id,
    isAgentBooking: true,
    slotId,
    date: slot.date,
    time: slot.time,
    customerName,
    customerPhone,
    service,
    bookedAt,
  });
  await demoWriteBookings(clientId, scope, all);

  const bookings = [
    ...slot.bookings,
    { id, isAgentBooking: true, customerName, customerPhone, service, bookedAt },
  ];
  return {
    ok: true,
    slot: toSlotView(
      slot.date,
      { time: slot.time, endTime: slot.endTime, capacity: slot.capacity, serviceKeyword: slot.serviceKeyword },
      slot.location,
      bookings
    ),
  };
}

async function demoCancel(
  clientId: string,
  bookingId: string,
  scope: BookingScope,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await demoReadBookings(clientId, scope);
  const idx = all.findIndex((b) => b.id === bookingId);
  if (idx === -1) return { ok: false, error: "Fant ikke bookingen." };
  all.splice(idx, 1);
  await demoWriteBookings(clientId, scope, all);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function loadSlots(
  clientId: string,
  scope: BookingScope = "live",
): Promise<SlotView[]> {
  const settings = await loadSettings(clientId);
  // Sandbox never consults Google, even when a calendar is connected — that
  // isolation is the entire point of the scope.
  if (scope === "sandbox") return demoSlotViews(clientId, settings, scope);
  if (!calendarConnected(settings)) return demoSlotViews(clientId, settings, scope);
  try {
    return await calendarSlotViews(settings);
  } catch (err) {
    // Same degrade-to-demo reasoning as loadCalendarView: a stored calendarId
    // that's stopped being reachable shouldn't crash slot lookups.
    console.error(`loadSlots: calendar unreachable for client ${clientId}:`, err);
    return demoSlotViews(clientId, settings, scope);
  }
}

export async function bookSlot(
  clientId: string,
  slotId: string,
  customerName: string,
  customerPhone: string,
  service?: string,
  scope: BookingScope = "live",
): Promise<{ ok: true; slot: SlotView } | { ok: false; error: string }> {
  const settings = await loadSettings(clientId);
  const svc = service?.trim() || "Demo / rådgivning";
  if (scope === "sandbox") {
    return demoBook(clientId, settings, slotId, customerName, customerPhone, svc, scope);
  }
  // Deliberately NOT falling back to demo mode here like the read paths do:
  // silently rerouting a real customer's booking into the local demo store
  // on a calendar error would tell them "you're booked" while the business
  // never sees it — a false confirmation is worse than a loud failure. Let
  // it throw/reject; the chat route's existing tool-error handling already
  // turns that into "beklager, teknisk feil" for the customer.
  return calendarConnected(settings)
    ? calendarBook(settings, slotId, customerName, customerPhone, svc)
    : demoBook(clientId, settings, slotId, customerName, customerPhone, svc, scope);
}

/* ------------------------------------------------------------------ */
/* Post-booking notes — a wish that surfaces AFTER the booking is made */
/* (e.g. «ønsker vurdering av PDR/bulk») gets appended to the existing */
/* booking's service field, so the department actually sees it. The    */
/* booking is identified by date + time + phone: the model reliably    */
/* knows those, unlike internal ids.                                   */
/* ------------------------------------------------------------------ */

const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** Wipes every sandbox booking for the client. Sandbox-only by construction
 *  — the writer is the demo store, which never touches Google Calendar. */
export async function clearSandboxBookings(clientId: string): Promise<{ removed: number }> {
  const existing = await demoReadBookings(clientId, "sandbox");
  await demoWriteBookings(clientId, "sandbox", []);
  return { removed: existing.length };
}

export async function appendBookingNote(
  clientId: string,
  date: string,
  time: string,
  customerPhone: string,
  note: string,
  scope: BookingScope = "live",
): Promise<{ ok: true; service: string } | { ok: false; error: string }> {
  const trimmedNote = note.trim();
  if (!trimmedNote) return { ok: false, error: "Notatet er tomt." };
  const settings = await loadSettings(clientId);

  if (scope === "live" && calendarConnected(settings)) {
    const startUTC = osloToUTC(date, "00:00");
    const endUTC = new Date(startUTC.getTime() + 24 * 3600 * 1000);
    const events = await listEvents(settings.calendarId!, startUTC.toISOString(), endUTC.toISOString());
    const match = events.find((e) => {
      const priv = e.extendedProperties?.private;
      if (priv?.hzAgent !== "1" || !e.start?.dateTime) return false;
      const start = osloParts(e.start.dateTime);
      return (
        start.date === date &&
        start.time === time &&
        digitsOnly(priv.customerPhone ?? "") === digitsOnly(customerPhone)
      );
    });
    if (!match) return { ok: false, error: "Fant ingen booking på det tidspunktet og nummeret." };
    const priv = match.extendedProperties?.private ?? {};
    const service = priv.service ?? match.summary ?? "";
    if (service.includes(trimmedNote)) return { ok: true, service };
    const newService = service ? `${service} + ${trimmedNote}` : trimmedNote;
    await patchEvent(settings.calendarId!, match.id, {
      summary: `${newService} – ${priv.customerName ?? ""}`.trim(),
      extendedProperties: { private: { ...priv, service: newService } },
    });
    return { ok: true, service: newService };
  }

  const bookings = await demoReadBookings(clientId, scope);
  const idx = bookings.findIndex(
    (b) =>
      b.date === date &&
      b.time === time &&
      digitsOnly(b.customerPhone ?? "") === digitsOnly(customerPhone),
  );
  if (idx === -1) return { ok: false, error: "Fant ingen booking på det tidspunktet og nummeret." };
  const service = bookings[idx].service ?? "";
  if (service.includes(trimmedNote)) return { ok: true, service };
  const newService = service ? `${service} + ${trimmedNote}` : trimmedNote;
  bookings[idx] = { ...bookings[idx], service: newService };
  await demoWriteBookings(clientId, scope, bookings);
  return { ok: true, service: newService };
}

/**
 * Cancels a single booking by id. Only ever removes bookings the agent
 * itself created — calendarCancel re-checks the hzAgent marker server-side
 * regardless of what the caller believes, so an event imported from the
 * store's other systems can never be deleted from here.
 */
export async function cancelBooking(
  clientId: string,
  bookingId: string,
  scope: BookingScope = "live",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await loadSettings(clientId);
  if (scope === "sandbox") return demoCancel(clientId, bookingId, scope);
  return calendarConnected(settings)
    ? calendarCancel(settings, bookingId)
    : demoCancel(clientId, bookingId, scope);
}

/* ------------------------------------------------------------------ */
/* Calendar view — real events + bookable slots for the dashboard      */
/* ------------------------------------------------------------------ */

export type CalEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (Oslo)
  start: string; // HH:MM (Oslo)
  end: string; // HH:MM (Oslo)
  isAgentBooking: boolean;
  customerName?: string;
  customerPhone?: string;
  service?: string;
};

export type CalendarView = {
  slots: SlotView[];
  events: CalEvent[];
  connected: boolean;
  location: string;
  calendarName?: string;
  /** True when this view is the isolated voice sandbox, not the real setup. */
  sandbox?: boolean;
};

async function calendarEvents(settings: Settings, dates: string[]): Promise<CalEvent[]> {
  const raw = await fetchCalendarEvents(settings, dates);
  const wanted = new Set(dates);
  const out: CalEvent[] = [];
  for (const e of raw) {
    const s = osloParts(e.start!.dateTime!);
    const en = osloParts(e.end!.dateTime!);
    if (!wanted.has(s.date)) continue;
    const priv = e.extendedProperties?.private ?? {};
    out.push({
      id: e.id,
      title: e.summary || "Opptatt",
      date: s.date,
      start: s.time,
      end: en.time,
      isAgentBooking: priv.hzAgent === "1",
      customerName: priv.customerName,
      customerPhone: priv.customerPhone,
      service: priv.service,
    });
  }
  return out;
}

async function demoCalendarView(
  clientId: string,
  settings: Settings,
  scope: BookingScope,
): Promise<CalendarView> {
  const slots = await demoSlotViews(clientId, settings, scope);
  const events: CalEvent[] = slots.flatMap((s) =>
    s.bookings.map((b) => ({
      // Use the booking's own id, not a positional one — the dashboard's
      // delete action needs an id that survives other bookings being removed.
      id: b.id,
      title: b.service || "Booket",
      date: s.date,
      start: s.time,
      end: s.endTime,
      isAgentBooking: true,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      service: b.service,
    }))
  );
  return {
    slots,
    events,
    connected: false,
    location: settings.locationName,
    ...(scope === "sandbox" ? { sandbox: true as const } : {}),
  };
}

export async function loadCalendarView(
  clientId: string,
  scope: BookingScope = "live",
): Promise<CalendarView> {
  const settings = await loadSettings(clientId);
  if (scope === "sandbox") return demoCalendarView(clientId, settings, scope);
  if (calendarConnected(settings)) {
    try {
      const dates = upcomingDates(settings.daysAhead);
      const [slots, events] = await Promise.all([
        calendarSlotViews(settings),
        calendarEvents(settings, dates),
      ]);
      return {
        slots,
        events,
        connected: true,
        location: settings.locationName,
        calendarName: settings.calendarName,
      };
    } catch (err) {
      // A calendarId is stored, but the calendar itself isn't reachable
      // right now (unshared, deleted, service-account swapped, transient
      // Google API error, ...). Degrade to demo mode instead of a 500 —
      // this is exactly what happened when the service account was
      // rotated and the old test calendar was no longer shared with it.
      console.error(`loadCalendarView: calendar unreachable for client ${clientId}:`, err);
      return demoCalendarView(clientId, settings, scope);
    }
  }
  return demoCalendarView(clientId, settings, scope);
}
