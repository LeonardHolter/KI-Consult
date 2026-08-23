import { beforeEach, describe, expect, it, vi } from "vitest";

// How the KPI tiles came to report "0 bookinger" for a client whose agent had
// just booked all week:
//
// listAgentBookings looks a year back and two months forward. Google caps a
// page at 250 events, ordered oldest-first — so on a real shop calendar the
// page filled up with last autumn's ordinary bookings and never reached a
// single agent event. Nothing failed; the number was simply always zero, and
// stayed zero no matter how well the agent performed.
//
// Two defences, both tested here: ask Google to return only the agent's own
// events, and follow the pages to the end rather than trusting the first.

vi.mock("@/lib/google-calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-calendar")>("@/lib/google-calendar");
  return {
    ...actual,
    getServiceAccount: vi.fn(() => ({ client_email: "sa@test", private_key: "k" })),
    listEvents: vi.fn(async () => []),
    insertEvent: vi.fn(async () => ({ id: "e1" })),
  };
});

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return {
    ...actual,
    loadSettings: vi.fn(async () => ({
      ...actual.DEFAULT_SETTINGS,
      calendarId: "handzon.sstrommen@gmail.com",
    })),
  };
});

import { listEvents } from "@/lib/google-calendar";
import { listAgentBookings } from "@/lib/slots";

const CLIENT = "ad19951e-00e1-4293-8975-6c6bb1dbdad7";

const agentEvent = (date: string, name: string) => ({
  id: `evt-${name}`,
  status: "confirmed",
  start: { dateTime: `${date}T12:30:00+02:00` },
  extendedProperties: {
    private: {
      hzAgent: "1",
      customerName: name,
      customerPhone: "+4747673267",
      service: "Vask utvendig Basic",
      bookedAt: `${date}T10:00:00.000Z`,
    },
  },
});

beforeEach(() => vi.mocked(listEvents).mockReset());

describe("listAgentBookings", () => {
  it("has Google filter to the agent's own events, so the page cannot fill with the shop's calendar", async () => {
    vi.mocked(listEvents).mockResolvedValue([agentEvent("2026-08-26", "Sonja")]);

    const bookings = await listAgentBookings(CLIENT);

    expect(bookings).toHaveLength(1);
    const [, , , opts] = vi.mocked(listEvents).mock.calls[0];
    expect(opts).toEqual({ privateExtendedProperty: "hzAgent=1" });
  });

  it("still ignores anything that is not an agent booking", async () => {
    vi.mocked(listEvents).mockResolvedValue([
      agentEvent("2026-08-26", "Sonja"),
      // A shop-made event that slipped through the filter must not be counted
      // as the agent's work — the KPI is what the agent earned.
      { id: "manual", status: "confirmed", start: { dateTime: "2026-08-27T09:30:00+02:00" }, extendedProperties: { private: {} } },
    ]);

    const bookings = await listAgentBookings(CLIENT);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].customerName).toBe("Sonja");
  });

  it("drops cancelled events", async () => {
    vi.mocked(listEvents).mockResolvedValue([
      { ...agentEvent("2026-08-26", "Sonja"), status: "cancelled" },
    ]);
    expect(await listAgentBookings(CLIENT)).toHaveLength(0);
  });

  it("carries bookedAt through, since the KPI epoch is measured against it", async () => {
    vi.mocked(listEvents).mockResolvedValue([agentEvent("2026-08-26", "Sonja")]);
    const [booking] = await listAgentBookings(CLIENT);
    expect(booking.bookedAt).toBe("2026-08-26T10:00:00.000Z");
  });
});

describe("listEvents paging", () => {
  // The cap is per PAGE, not per query. One page looked like the whole
  // calendar, and the events that mattered were on the next one.
  it("follows nextPageToken instead of stopping at the first 250", async () => {
    // A throwaway key pair so the real token-signing path runs; the token
    // exchange itself is stubbed below, so nothing leaves the machine.
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
      JSON.stringify({ client_email: "sa@test.iam.gserviceaccount.com", private_key: privateKey }),
    ).toString("base64");

    const actual = await vi.importActual<typeof import("@/lib/google-calendar")>("@/lib/google-calendar");
    const pages = [
      { items: [{ id: "a" }], nextPageToken: "p2" },
      { items: [{ id: "b" }], nextPageToken: "p3" },
      { items: [{ id: "c" }] },
    ];
    let call = 0;
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(url);
      // The token exchange goes to oauth2; calendar pages come after.
      if (url.includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify(pages[call++]), { status: 200 });
    }));

    const events = await actual.listEvents("cal@x", "2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");

    expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(seen.filter((u) => u.includes("pageToken=p2"))).toHaveLength(1);
    expect(seen.filter((u) => u.includes("pageToken=p3"))).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
