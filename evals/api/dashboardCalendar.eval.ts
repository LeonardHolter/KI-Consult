import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin toggle for whether a client's dashboard shows the booking calendar.
// Built for Hedin Automotive Haugesund (2026-09-13): an intake-only agent
// never books, and an empty grid with a «Testkalender» switch reads as a
// broken product. Same contract as the chat-widget toggle: admins only,
// stored per client, and an unset flag reads as SHOWN so no existing client
// lost their calendar when the field appeared.

const profile = { row: { role: "admin" } as { role: string } | null };
const saved: Record<string, unknown>[] = [];
const stored = { settings: {} as Record<string, unknown> };

vi.mock("@/lib/portal/data", () => ({
  getProfile: async () => profile.row,
}));

vi.mock("@/lib/settings", () => ({
  loadSettings: async () => stored.settings,
  saveSettings: async (_clientId: string, patch: Record<string, unknown>) => {
    saved.push(patch);
    stored.settings = { ...stored.settings, ...patch };
    return stored.settings;
  },
}));

import { GET, POST } from "@/app/api/portal/dashboard-calendar/route";

const CLIENT = "9c17e3d8-0fef-41d5-bb0b-7abcd7741029";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/portal/dashboard-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const get = () => GET(new Request(`http://test/api/portal/dashboard-calendar?client=${CLIENT}`));

beforeEach(() => {
  profile.row = { role: "admin" };
  saved.length = 0;
  stored.settings = {};
});

describe("dashboard calendar toggle", () => {
  it("reads as shown when the flag was never set", async () => {
    expect(await (await get()).json()).toEqual({ showCalendar: true });
  });

  it("hides the calendar and persists the flag", async () => {
    const res = await post({ clientId: CLIENT, show: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, showCalendar: false });
    expect(saved).toEqual([{ showCalendar: false }]);
    expect(await (await get()).json()).toEqual({ showCalendar: false });
  });

  it("turns it back on", async () => {
    await post({ clientId: CLIENT, show: false });
    await post({ clientId: CLIENT, show: true });
    expect(await (await get()).json()).toEqual({ showCalendar: true });
  });

  it("refuses a non-admin and a signed-out caller", async () => {
    profile.row = { role: "client" };
    expect((await post({ clientId: CLIENT, show: false })).status).toBe(403);
    expect((await get()).status).toBe(403);
    profile.row = null;
    expect((await post({ clientId: CLIENT, show: false })).status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("rejects a body without a boolean show", async () => {
    for (const body of [{ clientId: CLIENT }, { clientId: CLIENT, show: "false" }, {}]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(saved).toEqual([]);
  });
});
