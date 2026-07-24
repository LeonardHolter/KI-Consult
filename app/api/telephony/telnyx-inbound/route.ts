// Telnyx TeXML entry point for the Handz On phone number.
//
// Why this exists: an inbound call to +47 32 99 42 23 must reach OpenAI's SIP
// endpoint with the OpenAI PROJECT id as the SIP user part
// (sip:proj_…@sip.api.openai.com) — that's how OpenAI knows which project the
// call belongs to. A plain Telnyx FQDN connection forwards the DIALED NUMBER
// as the user part, which OpenAI can't route. A TeXML <Dial><Sip> lets us
// specify the exact target URI, user part and all.
//
// Flow: Telnyx POSTs here on an inbound call -> we return TeXML that dials the
// OpenAI SIP URI -> OpenAI receives the INVITE, fires realtime.call.incoming
// to /api/telephony/incoming, which accepts the call as the Handz On agent.
//
// The response is static and leaks nothing (it just says "dial OpenAI"), so an
// unauthenticated POST is harmless — real routing is gated by Telnyx only
// hitting this for genuine inbound calls to our number.

import { OPENAI_SIP_URI } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

function texmlDial(): string {
  // answerOnBridge: don't answer the PSTN leg (no ringback billing / early
  // media) until OpenAI's SIP leg actually answers.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true">
    <Sip>${OPENAI_SIP_URI}</Sip>
  </Dial>
</Response>`;
}

export async function POST() {
  return new Response(texmlDial(), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

// Telnyx can be configured to GET or POST the voice webhook; support both so a
// misconfigured method doesn't silently drop calls.
export async function GET() {
  return new Response(texmlDial(), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
