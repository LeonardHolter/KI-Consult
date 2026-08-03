import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin toggle for whether a client's dashboard loads the chat widget. What
// matters: only admins may flip it, the flag is stored per client, and an
// unset flag reads as SHOWN — otherwise adding the field would have silently
// hidden the widget for every existing client.

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

import { GET, POST } from "@/app/api/portal/chat-widget/route";

const CLIENT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/portal/chat-widget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const get = () => GET(new Request(`http://test/api/portal/chat-widget?client=${CLIENT}`));

beforeEach(() => {
  profile.row = { role: "admin" };
  saved.length = 0;
  stored.settings = {};
});

describe("chat widget toggle", () => {
  it("reads as shown when the flag was never set", async () => {
    expect(await (await get()).json()).toEqual({ showChatWidget: true });
  });

  it("hides the widget and persists the flag", async () => {
    const res = await post({ clientId: CLIENT, show: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, showChatWidget: false });
    expect(saved).toEqual([{ showChatWidget: false }]);
    expect(await (await get()).json()).toEqual({ showChatWidget: false });
  });

  it("turns it back on", async () => {
    await post({ clientId: CLIENT, show: false });
    await post({ clientId: CLIENT, show: true });
    expect(await (await get()).json()).toEqual({ showChatWidget: true });
  });

  it("refuses a non-admin", async () => {
    profile.row = { role: "client" };
    expect((await post({ clientId: CLIENT, show: false })).status).toBe(403);
    expect((await get()).status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    profile.row = null;
    expect((await post({ clientId: CLIENT, show: false })).status).toBe(403);
  });

  // A missing/garbled body must not be read as "hide it".
  it("rejects a body without a boolean show", async () => {
    for (const body of [{ clientId: CLIENT }, { clientId: CLIENT, show: "false" }, {}]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(saved).toEqual([]);
  });
});
