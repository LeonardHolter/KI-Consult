import type { Settings } from "@/lib/settings";
import type { GcalEvent } from "@/lib/google-calendar";
import { googleProvider } from "./google";

// Calendar provider abstraction — the seam that lets Outlook (Microsoft
// Graph) slot in as an adapter instead of a rebuild.
//
// The event shape is Google's (GcalEvent): summary/description/start/end +
// extendedProperties.private for our booking metadata. It is the canonical
// shape because every consumer (slots.ts, bookingTools.ts) already speaks
// it; a future Outlook adapter maps Graph events INTO this shape at its own
// edge (Graph's singleValueExtendedProperties become extendedProperties)
// rather than forcing a rename through the whole booking engine.
//
// Providers are stateless singletons: per-client state (which calendar,
// which provider) lives in Settings, credentials live in env. A provider
// answers two separate questions deliberately kept apart:
//   configured() — are OUR credentials present? (env, global)
//   testAccess() — can we reach THIS client's calendar? (per client)
// Conflating them was the class of mistake the status page exists to
// prevent: "not set up" and "broken" need different fixes.

export type CalendarEvent = GcalEvent;

/** What we WRITE differs from what we read: writes carry an explicit
 *  timeZone (bookings are entered in Oslo wall-clock time), reads come back
 *  with resolved dateTimes. */
export type CalendarEventInput = {
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type CalendarProviderId = "google" | "outlook";

export interface CalendarProvider {
  id: CalendarProviderId;
  /** Human name for UI cards and error messages. */
  label: string;
  /** Are the provider's own credentials configured in the environment? */
  configured(): boolean;
  /** What the admin needs for the connect flow — for Google, the service
   *  account e-mail the client must share their calendar with. Null when
   *  not configured. */
  connectionHint(): string | null;
  /** Verifies we can reach the calendar; returns its display name. Throws
   *  with a human-readable message when we can't. */
  testAccess(calendarId: string): Promise<string>;
  listEvents(
    calendarId: string,
    timeMinISO: string,
    timeMaxISO: string,
    opts?: { privateExtendedProperty?: string },
  ): Promise<CalendarEvent[]>;
  insertEvent(calendarId: string, event: CalendarEventInput): Promise<CalendarEvent>;
  patchEvent(calendarId: string, eventId: string, patch: CalendarEventInput): Promise<CalendarEvent>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

const PROVIDERS: Record<CalendarProviderId, CalendarProvider | null> = {
  google: googleProvider,
  outlook: null, // built when the first client needs it — the seam is what matters now
};

/** The client's chosen provider. Absent means Google: every existing client
 *  predates the field, and they are all on Google. */
export function getCalendarProvider(settings: Pick<Settings, "calendarProvider">): CalendarProvider {
  const id = settings.calendarProvider ?? "google";
  const provider = PROVIDERS[id];
  if (!provider) {
    // A stored provider we don't support yet must fail loudly at the call
    // site, not silently fall back to Google and book into the wrong system.
    throw new Error(`Kalenderleverandøren «${id}» er ikke tilgjengelig ennå.`);
  }
  return provider;
}

/** True when this client can reach a real calendar: a calendar is chosen AND
 *  the chosen provider's credentials exist. The booking engine uses this to
 *  decide between the real calendar and the local demo store. */
export function calendarConfigured(
  settings: Pick<Settings, "calendarProvider" | "calendarId">,
): boolean {
  if (!settings.calendarId) return false;
  const provider = PROVIDERS[settings.calendarProvider ?? "google"];
  return Boolean(provider?.configured());
}
