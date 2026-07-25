import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The status page's job is triage: tell "our key is missing" apart from "our
// key is wrong" apart from "the vendor is down". These tests pin exactly that
// distinction, plus the two things a status page must never do — leak a
// secret, or hang because a dependency is hanging.

const { supabaseSelect, getAccessToken, blobList } = vi.hoisted(() => ({
  supabaseSelect: vi.fn(async () => ({ error: null as { message: string } | null })),
  getAccessToken: vi.fn(async () => "token"),
  blobList: vi.fn(async () => ({ blobs: [] })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ limit: supabaseSelect }) }) }),
}));
vi.mock("@/lib/google-calendar", () => ({ getAccessToken }));
vi.mock("@vercel/blob", () => ({ list: blobList }));

import { overallState, runStatusChecks, type CheckResult } from "@/lib/status/checks";

const ALL_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "TELNYX_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "RESEND_API_KEY",
];

const SECRET = "sk-super-secret-value";

/** Every vendor answers 200; Telnyx returns a healthy balance. */
const happyFetch = () =>
  vi.fn(async (url: string) =>
    url.includes("telnyx")
      ? new Response(JSON.stringify({ data: { balance: "250.00", currency: "USD" } }), { status: 200 })
      : new Response("{}", { status: 200 }),
  );

const byId = (results: CheckResult[], id: string) => results.find((r) => r.id === id)!;

beforeEach(() => {
  for (const k of ALL_KEYS) process.env[k] = SECRET;
  supabaseSelect.mockResolvedValue({ error: null });
  getAccessToken.mockResolvedValue("token");
  blobList.mockResolvedValue({ blobs: [] });
  vi.stubGlobal("fetch", happyFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ALL_KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

describe("status checks", () => {
  it("reports every service as ok when all of them answer", async () => {
    const results = await runStatusChecks();
    expect(results.map((r) => r.id).sort()).toEqual(
      ["anthropic", "blob", "google", "openai", "resend", "supabase", "telnyx"].sort(),
    );
    expect(results.every((r) => r.state === "ok")).toBe(true);
    expect(overallState(results)).toBe("ok");
  });

  // The distinction that cost us an afternoon: a missing key is a two-minute
  // fix in Vercel, an outage is not. They must never render the same.
  it("calls a missing key 'unconfigured', not 'down', and names the variable", async () => {
    delete process.env.TELNYX_API_KEY;
    const telnyx = byId(await runStatusChecks(), "telnyx");
    expect(telnyx.state).toBe("unconfigured");
    expect(telnyx.detail).toContain("TELNYX_API_KEY");
  });

  it("does not probe a service whose key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await runStatusChecks();
    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(urls.some((u: string) => u.includes("api.openai.com"))).toBe(false);
  });

  it("says a rejected key is our problem, not the vendor's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("openai") ? new Response("", { status: 401 }) : new Response("{}", { status: 200 }),
      ),
    );
    const openai = byId(await runStatusChecks(), "openai");
    expect(openai.state).toBe("down");
    expect(openai.detail).toContain("401");
  });

  it("marks a vendor 5xx as down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("resend") ? new Response("", { status: 503 }) : new Response("{}", { status: 200 }),
      ),
    );
    expect(byId(await runStatusChecks(), "resend").state).toBe("down");
    expect(overallState(await runStatusChecks())).toBe("down");
  });

  // A dead phone line with no error anywhere was the mystery we couldn't
  // explain. Zero balance is how that actually happens.
  it("warns on a low Telnyx balance before the line goes dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("telnyx")
          ? new Response(JSON.stringify({ data: { balance: "1.20", currency: "USD" } }), { status: 200 })
          : new Response("{}", { status: 200 }),
      ),
    );
    const telnyx = byId(await runStatusChecks(), "telnyx");
    expect(telnyx.state).toBe("degraded");
    expect(telnyx.detail).toContain("1.20");
  });

  it("surfaces a Supabase query error instead of throwing", async () => {
    supabaseSelect.mockResolvedValue({ error: { message: "relation does not exist" } });
    const supabase = byId(await runStatusChecks(), "supabase");
    expect(supabase.state).toBe("down");
    expect(supabase.detail).toContain("relation");
  });

  it("a thrown probe becomes 'down' rather than crashing the page", async () => {
    getAccessToken.mockRejectedValue(new Error("invalid_grant"));
    const results = await runStatusChecks();
    expect(byId(results, "google").state).toBe("down");
    // The rest of the page still renders — that is the whole point.
    expect(byId(results, "openai").state).toBe("ok");
  });

  // A status page that hangs when a vendor hangs is the one page that must not.
  it("times out a hanging probe instead of hanging with it", async () => {
    vi.useFakeTimers();
    blobList.mockImplementation(() => new Promise(() => {}));
    const pending = runStatusChecks();
    await vi.advanceTimersByTimeAsync(10_000);
    const blob = byId(await pending, "blob");
    expect(blob.state).toBe("down");
    expect(blob.detail).toContain("timeout");
    vi.useRealTimers();
  });

  it("never puts key material in a result", async () => {
    // Vendors love echoing your key back in an error body; truncation is not
    // enough on its own, so assert the whole payload is clean.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`bad key: ${SECRET}`, { status: 400 })),
    );
    const serialized = JSON.stringify(await runStatusChecks());
    expect(serialized).not.toContain(SECRET);
  });

  it("overall state reports the worst thing found", () => {
    const at = (state: CheckResult["state"]): CheckResult =>
      ({ id: "x", name: "x", impact: "x", state, latencyMs: 1 });
    expect(overallState([at("ok"), at("unconfigured")])).toBe("unconfigured");
    expect(overallState([at("ok"), at("unconfigured"), at("degraded")])).toBe("degraded");
    expect(overallState([at("degraded"), at("down")])).toBe("down");
  });
});
