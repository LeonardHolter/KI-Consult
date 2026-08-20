import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telephony/numbers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony/numbers")>()),
  clientForNumber: vi.fn(async () => null),
}));
import { GET, POST } from "@/app/api/telephony/telnyx-inbound/route";
import { OPENAI_SIP_URI } from "@/lib/telephony/config";
import { clientForNumber } from "@/lib/telephony/numbers";

// The TeXML the number returns must dial OpenAI's SIP URI with the project id
// as the user part — that exact string is the whole reason this route exists
// instead of a plain FQDN connection. It must also request recording with a
// callback to our recording webhook, or phone calls silently go unrecorded.

const req = () =>
  new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound", {
    method: "POST",
    headers: { host: "www.kiconsult.no" },
  });

describe("telnyx-inbound TeXML", () => {
  it("returns TeXML that dials the OpenAI SIP URI, project user-part intact", async () => {
    for (const res of [await POST(req()), await GET(req())]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("xml");
      const body = await res.text();
      expect(body).toContain("<Dial");
      expect(body).toMatch(new RegExp(`<Sip>${OPENAI_SIP_URI.replace(/[.?+;]/g, (c) => "\\" + c)}\\?(X-Dialed-Number=[^&<]+&amp;)?X-Transfer-Key=[a-f0-9-]{36}</Sip>`));
      // Guardrails against the two mistakes that would silently break routing.
      expect(body).toContain("sip.api.openai.com"); // not sip.openai.com
      expect(body).toContain("proj_"); // project id present as user part
      expect(body).toContain("transport=tls");
    }
  });

  // Without this, the dialed number never survives the hop to OpenAI (the
  // INVITE addresses the project, not the line), every call looks unrouted,
  // and each new client's number reaches the fallback client's agent.
  it("passes the dialed number along as an X- SIP header, from the POST body", async () => {
    // Namsos: fortsatt OpenAI-stien. Standardlinjen (Handz On) dialer nå
    // ElevenLabs, der identiteten ligger i SIP-user-parten, ikke i X-headere.
    vi.mocked(clientForNumber).mockResolvedValueOnce("fe264dcd-84e0-4e59-8efb-cbb5e39c8125");
    const form = new URLSearchParams({ To: "+4723509651", From: "+4791234567" });
    const res = await POST(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound", {
        method: "POST",
        headers: { host: "www.kiconsult.no", "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }),
    );
    const body = await res.text();
    expect(body).toContain("X-Dialed-Number=%2B4723509651");
    expect(body).toContain("proj_"); // the project user part is still intact
  });

  it("passes the dialed number along from the GET query string too", async () => {
    vi.mocked(clientForNumber).mockResolvedValueOnce("fe264dcd-84e0-4e59-8efb-cbb5e39c8125");
    const res = await GET(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4723509651", {
        headers: { host: "www.kiconsult.no" },
      }),
    );
    expect(await res.text()).toContain("X-Dialed-Number=%2B4723509651");
  });

  it("dials the plain URI when the dialed number is missing", async () => {
    const body = await (await POST(req())).text();
    expect(body).toMatch(new RegExp(`<Sip>${OPENAI_SIP_URI.replace(/[.?+;]/g, (c) => "\\" + c)}\\?(X-Dialed-Number=[^&<]+&amp;)?X-Transfer-Key=[a-f0-9-]{36}</Sip>`));
    expect(body).not.toContain("X-Dialed-Number");
  });

  it("requests dual-channel recording, callback tagged with the resolved client", async () => {
    const body = await (await POST(req())).text();
    expect(body).toContain('record="record-from-answer"');
    expect(body).toContain('recordingChannels="dual"');
    // No mapping resolves to the DEFAULT line's client explicitly — the
    // recording must land in that client's panel, not rely on the recording
    // route's own fallback.
    expect(body).toMatch(
      /recordingStatusCallback="https:\/\/www\.kiconsult\.no\/api\/telephony\/telnyx-recording\?client=/,
    );
    expect(body).toContain('recordingStatusCallbackMethod="POST"');
  });
});

// The recording callback is the only chance to say who the recording belongs
// to: the callback itself fires after the call and carries nothing about
// which line rang.
describe("telnyx-inbound recording callback", () => {
  it("tags the recording callback with the client the dialed number maps to", async () => {
    vi.mocked(clientForNumber).mockResolvedValue("fe264dcd-84e0-4e59-8efb-cbb5e39c8125");
    const res = await GET(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4723509651", {
        headers: { host: "www.kiconsult.no" },
      }),
    );
    expect(await res.text()).toContain(
      'recordingStatusCallback="https://www.kiconsult.no/api/telephony/telnyx-recording' +
        '?client=fe264dcd-84e0-4e59-8efb-cbb5e39c8125"',
    );
  });

  it("an unmapped number resolves to the default line's client", async () => {
    vi.mocked(clientForNumber).mockResolvedValue(null);
    const res = await GET(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4799999999", {
        headers: { host: "www.kiconsult.no" },
      }),
    );
    const body = await res.text();
    // PHONE_CLIENT_ID fallback, same rule as /api/telephony/incoming: the
    // default line has no row in the number map, so null means "the
    // original line", not "no client".
    expect(body).toContain("telnyx-recording?client=");
  });
});
