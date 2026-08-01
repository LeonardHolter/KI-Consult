import { beforeEach, describe, expect, it, vi } from "vitest";

// The portal's calendar goes through this proxy. It used to 401 for any client
// without a client_secrets row — which is every client onboarding creates, so a
// new client's dashboard showed no calendar at all. Only the original Handz On
// row exists, and it points back at this very app; a missing row therefore
// means "serve it from here", not "no access".

const auth = { user: { id: "user-1" } as { id: string } | null };
const profile = {
  row: { client_id: null as string | null, role: "admin" } as
    | { client_id: string | null; role: string }
    | null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile.row }) }),
      }),
    }),
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/bot/[...path]/route";

const CLIENT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125";

/** Supabase REST reply for client_secrets, then the forwarded upstream call. */
function mockFetch(secretRows: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("client_secrets")) {
        return new Response(JSON.stringify(secretRows), { status: 200 });
      }
      return new Response(JSON.stringify({ slots: [], sandbox: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const call = (qs: string) =>
  GET(new NextRequest(`https://www.kiconsult.no/api/bot/calendar-view${qs}`), {
    params: Promise.resolve({ path: ["calendar-view"] }),
  });

beforeEach(() => {
  auth.user = { id: "user-1" };
  profile.row = { client_id: null, role: "admin" };
});

describe("bot proxy target resolution", () => {
  it("serves a client with no secrets row from this app's own origin", async () => {
    const calls = mockFetch([]);
    const res = await call(`?client=${CLIENT}&scope=sandbox`);

    expect(res.status).toBe(200);
    const forwarded = calls.find((u) => !u.includes("client_secrets"))!;
    expect(forwarded).toContain("https://www.kiconsult.no/api/calendar-view");
    expect(forwarded).toContain(`client=${CLIENT}`);
    // The scope must survive, or the sandbox calendar can never be shown.
    expect(forwarded).toContain("scope=sandbox");
  });

  it("still forwards to a client's own deployment when one is configured", async () => {
    const calls = mockFetch([{ bot_base_url: "https://bot.example.com/", admin_secret: "s3cret" }]);
    await call(`?client=${CLIENT}`);

    expect(calls.find((u) => !u.includes("client_secrets"))).toContain(
      "https://bot.example.com/api/calendar-view",
    );
  });

  it("still refuses a caller with no session", async () => {
    auth.user = null;
    mockFetch([]);
    expect((await call(`?client=${CLIENT}`)).status).toBe(401);
  });

  it("still refuses an admin who names no client", async () => {
    mockFetch([]);
    expect((await call("")).status).toBe(401);
  });

  it("pins a client account to its own client, ignoring the query param", async () => {
    profile.row = { client_id: "own-client", role: "client" };
    const calls = mockFetch([]);
    await call(`?client=${CLIENT}`);

    const forwarded = calls.find((u) => !u.includes("client_secrets"))!;
    expect(forwarded).toContain("client=own-client");
    expect(forwarded).not.toContain(CLIENT);
  });

  it("does not proxy paths outside the allowlist", async () => {
    mockFetch([]);
    const res = await GET(new NextRequest("https://www.kiconsult.no/api/bot/chat"), {
      params: Promise.resolve({ path: ["chat"] }),
    });
    expect(res.status).toBe(404);
  });
});
