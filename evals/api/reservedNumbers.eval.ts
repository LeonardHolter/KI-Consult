import { beforeEach, describe, expect, it, vi } from "vitest";

// The reserved-numbers endpoint is the outreach dialer's ONLY defense
// against cold-calling from a customer's line. It is deliberately public
// (owner's decision — digits of published business numbers only); what
// these tests pin is the CONTENT contract: every mapped customer number
// plus the default line, normalized, always.

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

beforeEach(() => {
  loadAssignments.mockResolvedValue({});
});

describe("reserved-numbers endpoint", () => {
  it("returns the default line even with an empty assignment map", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).reserved).toEqual(["4732994223"]);
  });

  it("includes every mapped customer number, normalized and sorted", async () => {
    loadAssignments.mockResolvedValue({ "4741111111": "client-c", "4740000000": "client-b" });
    const body = await (await GET()).json();
    expect(body.reserved).toEqual(["4732994223", "4740000000", "4741111111"]);
  });

  it("exposes ONLY digits — no client ids or names to enrich", async () => {
    loadAssignments.mockResolvedValue({ "4740000000": "client-b" });
    const body = await (await GET()).json();
    expect(Object.keys(body)).toEqual(["reserved"]);
    expect(JSON.stringify(body)).not.toContain("client-b");
  });
});
