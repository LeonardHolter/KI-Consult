import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin route for the shop's notification address. What matters: only admins
// may read or set it, junk never gets stored (a bad address means silently
// lost bookings later), and clearing works — that is how a shop opts out.

const profile = { row: { role: "admin" } as { role: string } | null };
const stored = { settings: {} as Record<string, unknown> };
const saved: Record<string, unknown>[] = [];

vi.mock("@/lib/portal/data", () => ({
  getProfile: async () => profile.row,
}));

vi.mock("@/lib/settings", () => ({
  loadSettings: async () => stored.settings,
  saveSettings: async (_c: string, patch: Record<string, unknown>) => {
    saved.push(patch);
    stored.settings = { ...stored.settings, ...patch };
    return stored.settings;
  },
}));

import { GET, POST } from "@/app/api/portal/notify-email/route";

const CLIENT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/portal/notify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  profile.row = { role: "admin" };
  stored.settings = {};
  saved.length = 0;
});

describe("notify-email admin route", () => {
  it("stores a valid address and reads it back", async () => {
    const res = await post({ clientId: CLIENT, email: " leonard@kiconsult.no " });
    expect(await res.json()).toEqual({ ok: true, notificationEmail: "leonard@kiconsult.no" });

    const read = await GET(new Request(`http://test/api/portal/notify-email?client=${CLIENT}`));
    expect(await read.json()).toEqual({ notificationEmail: "leonard@kiconsult.no" });
  });

  it("rejects junk instead of storing an address that can never deliver", async () => {
    for (const bad of ["ikke en epost", "a@b", "x@", 42]) {
      expect((await post({ clientId: CLIENT, email: bad })).status).toBe(400);
    }
    expect(saved).toEqual([]);
  });

  it("an empty string clears the address", async () => {
    await post({ clientId: CLIENT, email: "leonard@kiconsult.no" });
    const res = await post({ clientId: CLIENT, email: "" });
    expect(await res.json()).toEqual({ ok: true, notificationEmail: "" });
  });

  it("refuses non-admins and signed-out callers", async () => {
    profile.row = { role: "client" };
    expect((await post({ clientId: CLIENT, email: "a@b.no" })).status).toBe(403);
    profile.row = null;
    expect((await GET(new Request("http://test/api/portal/notify-email?client=x"))).status).toBe(403);
    expect(saved).toEqual([]);
  });
});
