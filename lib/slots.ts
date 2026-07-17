import fs from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import {
  getServiceAccount,
  insertEvent,
  listEvents,
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
      // Only count bookings the AI agent itself created. Other events on the
      // connected calendar (personal meetings, manual entries without the
      // hzAgent marker) shouldn't eat into the agent's booking capacity.
      if (e.extendedProperties?.private?.hzAgent !== "1") return false;
      const evStart = new Date(e.start!.dateTime!).getTime();
      const evEnd = new Date(e.end!.dateTime!).getTime();
      return evStart < endMs && evEnd > startMs;
    })
    .map((e) => {
      const priv = e.extendedProperties?.private ?? {};
      return {
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

  const bookings = [...slot.bookings, { customerName, customerPhone, service, bookedAt }];
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

/* ------------------------------------------------------------------ */
/* Demo mode (Vercel Blob / local file) — used until a calendar is     */
/* connected in the dashboard. Stores a flat list of bookings; slot     */
/* templates are always regenerated fresh from settings.               */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "data");
const bookingsFile = (clientId: string) => path.join(DATA_DIR, clientId, "demo-bookings.json");
const bookingsBlobPath = (clientId: string) => `${clientId}/demo-bookings.json`;

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

type DemoBooking = Booking & { slotId: string; date: string; time: string };

async function demoReadBookings(clientId: string): Promise<DemoBooking[]> {
  try {
    if (blobConfigured()) {
      const result = await get(bookingsBlobPath(clientId), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return [];
      return JSON.parse(await new Response(result.stream).text()) as DemoBooking[];
    }
    if (!fs.existsSync(bookingsFile(clientId))) return [];
    return JSON.parse(fs.readFileSync(bookingsFile(clientId), "utf-8"));
  } catch {
    return [];
  }
}

async function demoWriteBookings(clientId: string, bookings: DemoBooking[]) {
  if (blobConfigured()) {
    await put(bookingsBlobPath(clientId), JSON.stringify(bookings, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(bookingsFile(clientId)), { recursive: true });
    fs.writeFileSync(bookingsFile(clientId), JSON.stringify(bookings, null, 2));
  }
}

async function demoSlotViews(clientId: string, settings: Settings): Promise<SlotView[]> {
  const dates = upcomingDates(settings.daysAhead);
  const templates = slotTemplates(settings);
  const allBookings = await demoReadBookings(clientId);
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
  service: string
): Promise<{ ok: true; slot: SlotView } | { ok: false; error: string }> {
  const views = await demoSlotViews(clientId, settings);
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
  const all = await demoReadBookings(clientId);
  all.push({ slotId, date: slot.date, time: slot.time, customerName, customerPhone, service, bookedAt });
  await demoWriteBookings(clientId, all);

  const bookings = [...slot.bookings, { customerName, customerPhone, service, bookedAt }];
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

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function loadSlots(clientId: string): Promise<SlotView[]> {
  const settings = await loadSettings(clientId);
  return calendarConnected(settings)
    ? calendarSlotViews(settings)
    : demoSlotViews(clientId, settings);
}

export async function bookSlot(
  clientId: string,
  slotId: string,
  customerName: string,
  customerPhone: string,
  service?: string
): Promise<{ ok: true; slot: SlotView } | { ok: false; error: string }> {
  const settings = await loadSettings(clientId);
  const svc = service?.trim() || "Demo / rådgivning";
  return calendarConnected(settings)
    ? calendarBook(settings, slotId, customerName, customerPhone, svc)
    : demoBook(clientId, settings, slotId, customerName, customerPhone, svc);
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

export async function loadCalendarView(clientId: string): Promise<CalendarView> {
  const settings = await loadSettings(clientId);
  if (calendarConnected(settings)) {
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
  }
  const slots = await demoSlotViews(clientId, settings);
  const events: CalEvent[] = slots.flatMap((s) =>
    s.bookings.map((b, i) => ({
      id: `${s.id}-${i}`,
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
  return { slots, events, connected: false, location: settings.locationName };
}
