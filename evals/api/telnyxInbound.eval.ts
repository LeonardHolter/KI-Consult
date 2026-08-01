import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telephony/numbers", () => ({ clientForNumber: vi.fn(async () => null) }));
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
      expect(body).toContain(`<Sip>${OPENAI_SIP_URI}</Sip>`);
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
    const res = await GET(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4723509651", {
        headers: { host: "www.kiconsult.no" },
      }),
    );
    expect(await res.text()).toContain("X-Dialed-Number=%2B4723509651");
  });

  it("dials the plain URI when the dialed number is missing", async () => {
    const body = await (await POST(req())).text();
    expect(body).toContain(`<Sip>${OPENAI_SIP_URI}</Sip>`);
    expect(body).not.toContain("X-Dialed-Number");
  });

  it("requests dual-channel recording with a callback to our recording webhook", async () => {
    const body = await (await POST(req())).text();
    expect(body).toContain('record="record-from-answer"');
    expect(body).toContain('recordingChannels="dual"');
    expect(body).toContain(
      'recordingStatusCallback="https://www.kiconsult.no/api/telephony/telnyx-recording"',
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

  it("leaves the callback bare for an unmapped number, so it falls back", async () => {
    vi.mocked(clientForNumber).mockResolvedValue(null);
    const res = await GET(
      new Request("https://www.kiconsult.no/api/telephony/telnyx-inbound?To=%2B4799999999", {
        headers: { host: "www.kiconsult.no" },
      }),
    );
    const body = await res.text();
    expect(body).toContain(
      'recordingStatusCallback="https://www.kiconsult.no/api/telephony/telnyx-recording"',
    );
    expect(body).not.toContain("?client=");
  });
});
