import { beforeEach, describe, expect, it, vi } from "vitest";

// The reserved-numbers endpoint is the outreach dialer's ONLY defense
// against cold-calling from a customer's line. The promises: fails closed
// without configuration, rejects wrong secrets, and always includes both
// the mapped numbers and the default line.

const { loadAssignments } = vi.hoisted(() => ({
  loadAssignments: vi.fn(async (): Promise<Record<string, string>> => ({})),
}));
vi.mock("@/lib/telephony/numbers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony/numbers")>()),
  loadAssignments,
}));
vi.mock("@/lib/telephony/config", () => ({
  DEFAULT_PHONE_NUMBER: "+47 32 99 42 23",
}));

import { GET } from "@/app/api/telephony/reserved-numbers/route";

const get = (secret?: string) =>
  GET(new Request("http://test/api/telephony/reserved-numbers", {
    headers: secret ? { "X-Outreach-Secret": secret } : {},
  }));

beforeEach(() => {
  loadAssignments.mockResolvedValue({});
  delete process.env.OUTREACH_SHARED_SECRET;
});

describe("reserved-numbers endpoint", () => {
  it("fails closed (503) when no shared secret is configured", async () => {
    expect((await get("anything")).status).toBe(503);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env.OUTREACH_SHARED_SECRET = "s3cret";
    expect((await get()).status).toBe(403);
    expect((await get("wrong")).status).toBe(403);
  });

  it("returns the default line even with an empty assignment map", async () => {
    process.env.OUTREACH_SHARED_SECRET = "s3cret";
    const body = await (await get("s3cret")).json();
    expect(body.reserved).toEqual(["4732994223"]);
  });

  it("includes every mapped customer number, normalized", async () => {
    process.env.OUTREACH_SHARED_SECRET = "s3cret";
    loadAssignments.mockResolvedValue({ "4740000000": "client-b", "4741111111": "client-c" });
    const body = await (await get("s3cret")).json();
    expect(body.reserved).toEqual(["4732994223", "4740000000", "4741111111"]);
  });
});
