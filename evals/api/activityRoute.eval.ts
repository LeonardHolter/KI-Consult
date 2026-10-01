import { beforeEach, describe, expect, it, vi } from "vitest";

// Tenancy for the dashboard chart. The failure that matters is a client
// account reading another client's call volume by putting an id in the URL —
// so the route must decide the client from the SESSION, never the query.

const { profile, settings, activity } = vi.hoisted(() => ({
  profile: { row: null as { role: string; client_id?: string } | null },
  settings: { value: {} as Record<string, unknown> },
  activity: vi.fn(async () => [{ date: "2026-10-01", label: "1.10", calls: 2, minutes: 4 }]),
}));

vi.mock("@/lib/portal/data", () => ({ getProfile: async () => profile.row }));
vi.mock("@/lib/settings", () => ({ loadSettings: async () => settings.value }));
vi.mock("@/lib/callActivity", () => ({ getClientCallActivity: activity }));

import { GET } from "@/app/api/portal/activity/route";

const OWN = "9c17e3d8-0fef-41d5-bb0b-7abcd7741029";
const OTHER = "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const req = (client?: string) =>
  new Request(`https://www.kiconsult.no/api/portal/activity${client ? `?client=${client}` : ""}`);

beforeEach(() => {
  profile.row = { role: "client", client_id: OWN };
  settings.value = {};
  activity.mockClear();
});

describe("activity route", () => {
  it("refuses a signed-out caller", async () => {
    profile.row = null;
    expect((await GET(req())).status).toBe(403);
    expect(activity).not.toHaveBeenCalled();
  });

  it("pins a client account to its own client, whatever the URL says", async () => {
    await GET(req(OTHER));
    expect(activity).toHaveBeenCalledWith(OWN, 14);
  });

  it("lets an admin pick a client", async () => {
    profile.row = { role: "admin" };
    await GET(req(OTHER));
    expect(activity).toHaveBeenCalledWith(OTHER, 14);
  });

  it("asks an admin which client, rather than guessing", async () => {
    profile.row = { role: "admin" };
    expect((await GET(req())).status).toBe(400);
    expect(activity).not.toHaveBeenCalled();
  });

  it("sends no numbers at all when the client's KPIs are hidden", async () => {
    settings.value = { showKpis: false };
    const res = await GET(req());
    expect(await res.json()).toEqual({ show: false });
    expect(activity).not.toHaveBeenCalled();
  });
});
