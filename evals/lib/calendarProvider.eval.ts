import { describe, expect, it, vi } from "vitest";

// The provider seam exists so Outlook can be an adapter, not a rebuild.
// These tests pin the seam's contract: default routing, loud failure for
// unbuilt providers, and the configured/connected distinction.

const { getServiceAccount } = vi.hoisted(() => ({
  getServiceAccount: vi.fn((): { client_email: string } | null => ({ client_email: "sa@ki.iam.gserviceaccount.com" })),
}));
vi.mock("@/lib/google-calendar", () => ({
  getServiceAccount,
  testCalendarAccess: vi.fn(),
  listEvents: vi.fn(),
  insertEvent: vi.fn(),
  patchEvent: vi.fn(),
  getEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

import { calendarConfigured, getCalendarProvider } from "@/lib/calendar/provider";

describe("calendar provider seam", () => {
  it("routes to Google when no provider is set — every pre-field client is on Google", () => {
    expect(getCalendarProvider({}).id).toBe("google");
    expect(getCalendarProvider({ calendarProvider: "google" }).id).toBe("google");
  });

  it("fails loudly for a stored provider that isn't built yet, never silently falls back", () => {
    // Booking into the WRONG calendar system is worse than an error message.
    expect(() => getCalendarProvider({ calendarProvider: "outlook" })).toThrow(/outlook/i);
  });

  it("connectionHint exposes the service-account email the client must share with", () => {
    expect(getCalendarProvider({}).connectionHint()).toContain("@ki.iam");
  });

  it("calendarConfigured needs BOTH a chosen calendar and provider credentials", () => {
    expect(calendarConfigured({ calendarId: "cal@group.calendar.google.com" })).toBe(true);
    expect(calendarConfigured({})).toBe(false); // no calendar chosen
    getServiceAccount.mockReturnValue(null); // credentials missing
    expect(calendarConfigured({ calendarId: "cal@group.calendar.google.com" })).toBe(false);
  });

  it("an unbuilt provider is never 'configured', even with a calendarId saved", () => {
    expect(calendarConfigured({ calendarProvider: "outlook", calendarId: "x" })).toBe(false);
  });
});
