import {
  deleteEvent,
  getEvent,
  getServiceAccount,
  insertEvent,
  listEvents,
  patchEvent,
  testCalendarAccess,
} from "@/lib/google-calendar";
import type { CalendarProvider } from "./provider";

// Google adapter: a thin delegation over lib/google-calendar.ts, which stays
// the implementation on purpose — the evals mock that module directly, and a
// delegation layer keeps every one of those tests meaningful. Move the code
// only if a second Google entry point ever appears.

export const googleProvider: CalendarProvider = {
  id: "google",
  label: "Google Calendar",
  configured: () => Boolean(getServiceAccount()),
  connectionHint: () => getServiceAccount()?.client_email ?? null,
  testAccess: testCalendarAccess,
  listEvents,
  insertEvent,
  patchEvent,
  getEvent,
  deleteEvent,
};
