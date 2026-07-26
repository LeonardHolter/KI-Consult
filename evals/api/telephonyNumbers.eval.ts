import { beforeEach, describe, expect, it, vi } from "vitest";

// The number-wiring API changes call routing and touches the Telnyx account,
// so the promises under test are: admin-only, numbers must exist on OUR
// account, no silent takeover of another client's line, and the TeXML
// connection is copied from the known-working default line.

const { profile, telnyx, mapStore } = vi.hoisted(() => ({
  profile: { current: { role: "admin", client_id: null } as { role: string } | null },
  telnyx: {
    numbers: [] as { id: string; phone_number: string; connection_id?: string | null }[],
    setConnection: vi.fn(async () => {}),
  },
  mapStore: { map: {} as Record<string, string> },
}));

vi.mock("@/lib/portal/data", () => ({
  getProfile: vi.fn(async () => profile.current),
  getClients: vi.fn(async () => [
    { id: "handz-on", name: "Handz On" },
    { id: "client-b", name: "Bedrift B" },
  ]),
}));
vi.mock("@/lib/telephony/config", () => ({
  PHONE_CLIENT_ID: "handz-on",
  DEFAULT_PHONE_NUMBER: "+47 32 99 42 23",
}));
vi.mock("@/lib/telephony/telnyxNumbers", () => ({
  telnyxConfigured: () => true,
  listPhoneNumbers: vi.fn(async () => telnyx.numbers),
  setNumberConnection: telnyx.setConnection,
}));
vi.mock("@/lib/telephony/numbers", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/telephony/numbers")>();
  return {
    ...orig,
    loadAssignments: vi.fn(async () => ({ ...mapStore.map })),
    assignNumber: vi.fn(async (num: string, cid: string) => {
      mapStore.map[orig.normalizeNumber(num)] = cid;
    }),
    unassignClient: vi.fn(async (cid: string) => {
      for (const k of Object.keys(mapStore.map)) if (mapStore.map[k] === cid) delete mapStore.map[k];
    }),
  };
});

import { GET, POST } from "@/app/api/portal/telephony/numbers/route";

const getFor = (client: string) =>
  GET(new Request(`http://test/api/portal/telephony/numbers?client=${client}`));
const post = (body: unknown) =>
  POST(new Request("http://test/api/portal/telephony/numbers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  profile.current = { role: "admin" };
  mapStore.map = {};
  telnyx.setConnection.mockClear();
  telnyx.numbers = [
    { id: "n1", phone_number: "+4732994223", connection_id: "texml-app-1" },
    { id: "n2", phone_number: "+4740000000", connection_id: null },
  ];
});

describe("telephony numbers API", () => {
  it("rejects non-admins — this changes live call routing", async () => {
    profile.current = { role: "client" };
    expect((await getFor("client-b")).status).toBe(403);
    expect((await post({ clientId: "client-b", number: "+4740000000" })).status).toBe(403);
  });

  it("shows the default line as taken by its client even with an empty map", async () => {
    const body = await (await getFor("client-b")).json();
    const def = body.numbers.find((n: { phoneNumber: string }) => n.phoneNumber === "+4732994223");
    expect(def.assignedClientId).toBe("handz-on");
    expect(def.assignedClientName).toBe("Handz On");
  });

  it("assigns a free number and copies the default line's TeXML connection", async () => {
    const res = await post({ clientId: "client-b", number: "+47 40 00 00 00" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.assignedNumber).toBe("4740000000");
    expect(body.connectionWarning).toBeNull();
    expect(telnyx.setConnection).toHaveBeenCalledWith("n2", "texml-app-1");
    expect(mapStore.map["4740000000"]).toBe("client-b");
  });

  it("refuses to steal another client's number (409, names the holder)", async () => {
    const res = await post({ clientId: "client-b", number: "+4732994223" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Handz On");
    expect(mapStore.map["4732994223"]).toBeUndefined();
  });

  it("rejects numbers that are not on the Telnyx account", async () => {
    const res = await post({ clientId: "client-b", number: "+4799999999" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Telnyx-kontoen");
  });

  it("still saves the assignment when the connection PATCH fails, but says so", async () => {
    telnyx.setConnection.mockRejectedValueOnce(new Error("boom"));
    const body = await (await post({ clientId: "client-b", number: "+4740000000" })).json();
    expect(body.ok).toBe(true);
    expect(body.connectionWarning).toContain("manuelt");
    expect(mapStore.map["4740000000"]).toBe("client-b");
  });

  it("disconnect releases the client's number", async () => {
    mapStore.map["4740000000"] = "client-b";
    const body = await (await post({ clientId: "client-b", disconnect: true })).json();
    expect(body.ok).toBe(true);
    expect(mapStore.map["4740000000"]).toBeUndefined();
  });
});
