import { beforeEach, describe, expect, it, vi } from "vitest";

// The number->client map is what routes an incoming call to the right
// client's agent. What matters: normalization (the same number arrives as
// "+47 32 99 42 23" from a human and "sip:+4732994223@host" in a SIP
// header), one-number-one-client invariants, and that the SIP parser never
// mistakes garbage for a number.

const store: { json: string | null } = { json: null };
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () =>
    store.json === null
      ? { statusCode: 404, stream: null }
      : { statusCode: 200, stream: new Response(store.json).body },
  ),
  put: vi.fn(async (_path: string, body: string) => {
    store.json = body;
    return {};
  }),
}));

import {
  assignNumber,
  clientForNumber,
  dialedFromSipHeaders,
  normalizeNumber,
  numberForClient,
  numberFromSipUri,
  unassignClient,
} from "@/lib/telephony/numbers";

beforeEach(() => {
  store.json = null;
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("number normalization + SIP parsing", () => {
  it("normalizes every dress the same number wears to the same key", () => {
    expect(normalizeNumber("+47 32 99 42 23")).toBe("4732994223");
    expect(normalizeNumber("4732994223")).toBe("4732994223");
    expect(normalizeNumber("+47-32-99-42-23")).toBe("4732994223");
  });

  it("extracts the dialed number from SIP To-header variants", () => {
    expect(numberFromSipUri("sip:+4732994223@sip.telnyx.com")).toBe("4732994223");
    expect(numberFromSipUri("sips:+4732994223@host;tag=abc")).toBe("4732994223");
    expect(numberFromSipUri("<sip:+4732994223@host>")).toBe("4732994223");
  });

  it("returns null for headers with no plausible number, never a garbage key", () => {
    expect(numberFromSipUri("sip:anonymous@host")).toBeNull();
    expect(numberFromSipUri(undefined)).toBeNull();
    expect(numberFromSipUri("")).toBeNull();
  });
});

describe("assignment map", () => {
  it("routes by normalized number regardless of input format", async () => {
    await assignNumber("+47 32 99 42 23", "client-a");
    // Same key whether it came from a human ("+47 …") or a SIP header.
    expect(await clientForNumber(numberFromSipUri("sip:+4732994223@sip.telnyx.com")!)).toBe("client-a");
    expect(await clientForNumber("+47 32 99 42 23")).toBe("client-a");
  });

  it("a client keeps at most one number — reassigning releases the old", async () => {
    await assignNumber("4700000001", "client-a");
    await assignNumber("4700000002", "client-a");
    expect(await clientForNumber("4700000001")).toBeNull();
    expect(await numberForClient("client-a")).toBe("4700000002");
  });

  it("unassignClient removes the client's numbers and nothing else", async () => {
    await assignNumber("4700000001", "client-a");
    await assignNumber("4700000002", "client-b");
    await unassignClient("client-a");
    expect(await numberForClient("client-a")).toBeNull();
    expect(await clientForNumber("4700000002")).toBe("client-b");
  });

  it("an unmapped number resolves to null (caller falls back to the default line)", async () => {
    expect(await clientForNumber("4799999999")).toBeNull();
  });
});

// The routing bug this pins: OpenAI's To header holds the SIP URI we dialed,
// which addresses the PROJECT (sip:proj_…@sip.api.openai.com). Reading the
// number from there yields nothing, every call looks unrouted, and each new
// client's number lands on the fallback client's agent. The dialed number
// therefore rides along in X-Dialed-Number, set by the TeXML route.
describe("dialedFromSipHeaders", () => {
  const projectTo = { name: "To", value: "sip:proj_Acg1pm1jVY2qiqEWf01Al8S3@sip.api.openai.com" };

  it("reads the dialed number from X-Dialed-Number", () => {
    expect(
      dialedFromSipHeaders([projectTo, { name: "X-Dialed-Number", value: "+4723509651" }]),
    ).toBe("4723509651");
  });

  it("is case-insensitive about the header name", () => {
    expect(dialedFromSipHeaders([{ name: "x-dialed-number", value: "+4723509651" }])).toBe(
      "4723509651",
    );
  });

  it("returns null for a To header that only addresses the OpenAI project", () => {
    expect(dialedFromSipHeaders([projectTo])).toBeNull();
  });

  it("falls back to a To header that does carry a real number", () => {
    expect(dialedFromSipHeaders([{ name: "To", value: "sip:+4732994223@sip.telnyx.com" }])).toBe(
      "4732994223",
    );
  });

  it("returns null for missing or empty headers", () => {
    expect(dialedFromSipHeaders(undefined)).toBeNull();
    expect(dialedFromSipHeaders([])).toBeNull();
  });
});
