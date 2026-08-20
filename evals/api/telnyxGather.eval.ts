import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telephony/numbers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony/numbers")>()),
  clientForNumber: vi.fn(async () => "fe264dcd-84e0-4e59-8efb-cbb5e39c8125"),
}));

import { GET as inboundGET } from "@/app/api/telephony/telnyx-inbound/route";
import { POST as gatherPOST } from "@/app/api/telephony/gather/route";
import { OPENAI_SIP_URI } from "@/lib/telephony/config";

// The pre-roll notice + press-1 flow. What matters: the notice plays before
// any dial, a caller who presses 1 gets a dial with NO recording attributes
// at all (the recording never starts — that IS the objection handling), any
// other outcome gets the exact same recorded dial as before, and the routing
// header the whole multi-tenant setup depends on survives every branch.

const CLIENT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125";

const inbound = () =>
  inboundGET(
    new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4723509651", {
      headers: { host: "www.kiconsult.no" },
    }),
  );

const gather = (digits: string) =>
  gatherPOST(
    new Request(
      `https://www.kiconsult.no/api/telephony/gather?client=${CLIENT}&dialed=%2B4723509651`,
      {
        method: "POST",
        headers: { host: "www.kiconsult.no", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Digits: digits }),
      },
    ),
  );

describe("pre-roll notice (telnyx-inbound)", () => {
  it("plays the notice inside a Gather, then falls through to the recorded dial", async () => {
    const body = await (await inbound()).text();
    expect(body).toContain('<Gather input="dtmf" numDigits="1"');
    // clientForNumber is mocked to Namsos' id, which has a name-branded notice.
    expect(
      body,
    ).toContain(
      "<Play>https://www.kiconsult.no/telephony/notice-fe264dcd-84e0-4e59-8efb-cbb5e39c8125-v2.mp3</Play>",
    );
    // The Gather must come BEFORE the dial — the notice plays first.
    expect(body.indexOf("<Gather")).toBeLessThan(body.indexOf("<Dial"));
    // No keypress = recorded, exactly as before the pre-roll existed.
    expect(body).toContain('record="record-from-answer"');
    expect(body).toContain(`client=${CLIENT}`);
  });

  it("the gather action carries client and dialed for the branch response", async () => {
    const body = await (await inbound()).text();
    expect(body).toMatch(
      /action="https:\/\/www\.kiconsult\.no\/api\/telephony\/gather\?client=fe264dcd[^"]*dialed=%2B4723509651[^"]*"/,
    );
  });

  it("one transfer key rides the gather action, the dial action and the SIP INVITE alike", async () => {
    const body = await (await inbound()).text();
    // gather action + dial action carry ?key=, the INVITE carries
    // X-Transfer-Key= — the case-insensitive match finds all three.
    const keys = [...body.matchAll(/key=([a-f0-9-]{36})/gi)].map((m) => m[1]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(body).toContain(`X-Transfer-Key=${keys[0]}`);
  });

  it("routing header survives into the fallthrough dial", async () => {
    expect(await (await inbound()).text()).toContain("X-Dialed-Number=%2B4723509651");
  });
});

describe("gather action", () => {
  it("press 1: the dial carries NO recording attributes at all", async () => {
    const body = await (await gather("1")).text();
    expect(body).toContain(`<Sip>${OPENAI_SIP_URI}?X-Dialed-Number=%2B4723509651</Sip>`);
    expect(body).not.toContain("record");
    expect(body).not.toContain("telnyx-recording");
  });

  it("any other digit gets the normal recorded dial", async () => {
    for (const d of ["2", "0", "9"]) {
      const body = await (await gather(d)).text();
      expect(body).toContain('record="record-from-answer"');
      expect(body).toContain(`client=${CLIENT}`);
      expect(body).toContain("X-Dialed-Number=%2B4723509651");
    }
  });

  it("an empty Digits value records too — silence must never disable recording", async () => {
    expect(await (await gather("")).text()).toContain('record="record-from-answer"');
  });
});

describe("per-client notice", () => {
  it("Handz On and Namsos each get their name-branded notice", async () => {
    // clientForNumber is mocked above, so build the docs directly.
    const { inboundTexml } = await import("@/lib/telephony/texml");
    for (const [clientId, file] of [
      ["ad19951e-00e1-4293-8975-6c6bb1dbdad7", "notice-ad19951e-00e1-4293-8975-6c6bb1dbdad7.mp3"],
      ["fe264dcd-84e0-4e59-8efb-cbb5e39c8125", "notice-fe264dcd-84e0-4e59-8efb-cbb5e39c8125-v2.mp3"],
    ]) {
      const body = inboundTexml({ base: "https://www.kiconsult.no", dialed: null, clientId });
      expect(body).toContain(`/telephony/${file}`);
    }
  });

  it("every other client (and unknown) gets the default with the AI clause", async () => {
    const { inboundTexml } = await import("@/lib/telephony/texml");
    for (const clientId of ["18c22e0d-95f6-4a34-aac6-621281771364", null]) {
      const body = inboundTexml({ base: "https://www.kiconsult.no", dialed: null, clientId });
      expect(body).toContain("/telephony/opptak-varsel.mp3");
    }
  });
});

// The outage this buries: a raw `&` between the Gather action's query params
// made the whole document invalid XML, and Telnyx answered every call with
// «an application error has occurred». Both phone lines were dead.
describe("TeXML well-formedness", () => {
  it("no raw & anywhere — every ampersand is a proper entity", async () => {
    const { inboundTexml, gatherResponseTexml } = await import("@/lib/telephony/texml");
    const docs = [
      inboundTexml({
        base: "https://www.kiconsult.no",
        dialed: "+4732994223",
        clientId: "ad19951e-00e1-4293-8975-6c6bb1dbdad7",
      }),
      gatherResponseTexml({
        base: "https://www.kiconsult.no",
        dialed: "+4723509651",
        clientId: CLIENT,
        digits: "1",
      }),
    ];
    for (const doc of docs) {
      const rawAmps = doc.match(/&(?!amp;|lt;|gt;|quot;|apos;)/g);
      expect(rawAmps).toBeNull();
      // And the action URL must still carry BOTH params through the entity.
    }
    expect(docs[0]).toContain("client=ad19951e-00e1-4293-8975-6c6bb1dbdad7&amp;dialed=");
  });
});
