import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/telephony/telnyx-inbound/route";
import { OPENAI_SIP_URI } from "@/lib/telephony/config";

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
