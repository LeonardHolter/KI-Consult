import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the admin onboarding route. The promise under test is safety:
// only admins can use it, a duplicate slug can never clobber an existing
// client, seeding NEVER overwrites prompts someone already customized
// (ignoreDuplicates), and a failed profile insert rolls back the auth user
// instead of leaving a dangling login.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let upsertCalls: { table: string; row: Row; opts: Row }[] = [];
let deletedAuthUsers: string[] = [];
let failProfileInsert = false;

function fakeFrom(table: string) {
  const rows = () => (db[table] ??= []);
  const filters: [string, unknown][] = [];
  const matches = () => rows().filter((r) => filters.every(([k, v]) => r[k] === v));
  const builder = {
    select: () => builder,
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return builder;
    },
    maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
    insert: (row: Row) => {
      if (table === "profiles" && failProfileInsert) {
        const res = { data: null, error: { message: "profiles insert failed" } };
        return Object.assign(Promise.resolve(res), {
          select: () => ({ single: async () => res }),
        });
      }
      const withId = { id: `${table}-${rows().length + 1}`, ...row };
      rows().push(withId);
      const res = { data: withId, error: null };
      return Object.assign(Promise.resolve(res), {
        select: () => ({ single: async () => res }),
      });
    },
    upsert: async (row: Row, opts: Row) => {
      upsertCalls.push({ table, row, opts });
      const conflictKey = String(opts?.onConflict ?? "id");
      const existing = rows().find((r) => r[conflictKey] === row[conflictKey]);
      if (existing) {
        if (!opts?.ignoreDuplicates) Object.assign(existing, row);
        return { error: null };
      }
      rows().push({ ...row });
      return { error: null };
    },
    // `await supabase.from(t).select().eq(...)` with no terminal — thenable.
    then: (resolve: (v: { data: Row[]; error: null }) => void) =>
      resolve({ data: matches(), error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fakeFrom,
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => ({
          data: { user: { id: `auth-${email}` } },
          error: null,
        }),
        deleteUser: async (id: string) => {
          deletedAuthUsers.push(id);
          return { error: null };
        },
      },
    },
  }),
}));

let currentProfile: { role: string } | null = null;
vi.mock("@/lib/portal/data", () => ({ getProfile: vi.fn(async () => currentProfile) }));
vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return { ...actual, loadSettings: vi.fn(async () => ({ ...actual.DEFAULT_SETTINGS })) };
});
vi.mock("@/lib/google-calendar", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/google-calendar")>("@/lib/google-calendar");
  return { ...actual, getServiceAccount: vi.fn(() => null) };
});

import { GET, POST } from "@/app/api/portal/onboarding/route";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/portal/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  upsertCalls = [];
  deletedAuthUsers = [];
  failProfileInsert = false;
  currentProfile = { role: "admin" };
});

describe("auth gate", () => {
  it("rejects non-admins on every action", async () => {
    currentProfile = { role: "client" };
    expect((await post({ action: "create", name: "X", slug: "x" })).status).toBe(403);
    expect((await GET(new Request("http://test/x?clientId=abc"))).status).toBe(403);
    currentProfile = null;
    expect((await post({ action: "create", name: "X", slug: "x" })).status).toBe(403);
  });
});

describe("create", () => {
  it("creates the client and seeds BOTH bot surfaces with starter prompts", async () => {
    const res = await post({ action: "create", name: "Testbedrift AS", slug: "testbedrift" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client.slug).toBe("testbedrift");

    expect(db.clients).toHaveLength(1);
    expect(db.chat_bot_settings?.[0]?.instructions).toContain("Testbedrift AS");
    expect(db.voice_demo_settings?.[0]?.instructions).toContain("finish_session");
    expect(String(db.voice_demo_settings?.[0]?.instructions)).toContain("[FYLL INN");
  });

  it("rejects a duplicate slug instead of touching the existing client", async () => {
    await post({ action: "create", name: "Første", slug: "samme-slug" });
    const res = await post({ action: "create", name: "Andre", slug: "samme-slug" });
    expect(res.status).toBe(409);
    expect(db.clients).toHaveLength(1);
    expect(db.clients[0].name).toBe("Første");
  });

  it("never overwrites existing customized prompts — seeding uses ignoreDuplicates", async () => {
    // A half-onboarded client already has a customized chat prompt.
    db.chat_bot_settings = [
      { client_id: "clients-1", instructions: "MIN NØYE TILPASSEDE PROMPT" },
    ];
    await post({ action: "create", name: "Testbedrift", slug: "testbedrift" });

    for (const call of upsertCalls) {
      expect(call.opts).toMatchObject({ ignoreDuplicates: true });
    }
    // The customized prompt survived untouched.
    expect(db.chat_bot_settings[0].instructions).toBe("MIN NØYE TILPASSEDE PROMPT");
  });

  it("rejects malformed slugs", async () => {
    for (const bad of ["Har Mellomrom", "ÆØÅ", "under_score", "-starter-med-strek"]) {
      expect((await post({ action: "create", name: "X", slug: bad })).status).toBe(400);
    }
  });
});

describe("invite", () => {
  it("creates the auth user + client-pinned profile and returns one-time credentials", async () => {
    const res = await post({
      action: "invite",
      clientId: "client-123",
      email: "sabah@example.no",
      fullName: "Sabah Ali",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("sabah@example.no");
    expect(body.password.length).toBeGreaterThanOrEqual(10);
    expect(db.profiles?.[0]).toMatchObject({
      client_id: "client-123",
      role: "client",
      full_name: "Sabah Ali",
    });
  });

  it("rolls back the auth user when the profile insert fails", async () => {
    failProfileInsert = true;
    const res = await post({ action: "invite", clientId: "client-123", email: "x@y.no" });
    expect(res.status).toBe(500);
    expect(deletedAuthUsers).toEqual(["auth-x@y.no"]);
  });
});

describe("status checklist", () => {
  it("reports seeded-vs-customized and user count for a client", async () => {
    await post({ action: "create", name: "Testbedrift", slug: "testbedrift" });
    const clientId = db.clients[0].id as string;
    db.chat_bot_settings[0].client_id = clientId;
    db.voice_demo_settings[0].client_id = clientId;

    const res = await GET(new Request(`http://test/x?clientId=${clientId}`));
    expect(res.status).toBe(200);
    const { status } = await res.json();
    expect(status).toMatchObject({
      chatSeeded: true,
      chatCustomized: false, // starter template still has [FYLL INN]
      voiceSeeded: true,
      voiceCustomized: false,
      calendarConnected: false,
      voiceBookingMode: "sandbox",
      userCount: 0,
    });
  });
});
