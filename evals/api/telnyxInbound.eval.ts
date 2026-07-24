import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/telephony/telnyx-inbound/route";
import { OPENAI_SIP_URI } from "@/lib/telephony/config";

// The TeXML the number returns must dial OpenAI's SIP URI with the project id
// as the user part — that exact string is the whole reason this route exists
// instead of a plain FQDN connection.

describe("telnyx-inbound TeXML", () => {
  it("returns TeXML that dials the OpenAI SIP URI, project user-part intact", async () => {
    for (const res of [await POST(), await GET()]) {
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
});
