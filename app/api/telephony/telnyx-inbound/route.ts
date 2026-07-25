// Telnyx TeXML entry point for the Handz On phone number.
//
// Why this exists: an inbound call to +47 32 99 42 23 must reach OpenAI's SIP
// endpoint with the OpenAI PROJECT id as the SIP user part
// (sip:proj_…@sip.api.openai.com) — that's how OpenAI knows which project the
// call belongs to. A plain Telnyx FQDN connection forwards the DIALED NUMBER
// as the user part, which OpenAI can't route. A TeXML <Dial><Sip> lets us
// specify the exact target URI, user part and all.
//
// Recording: the Dial carries record attributes so Telnyx records both legs
// (dual channel: caller left, agent right) and POSTs the finished recording
// to /api/telephony/telnyx-recording, which stores it in the same
// «Samtaleopptak» panel the browser agent uses. Telnyx recording URLs are
// only valid for ~10 minutes after the call, so that route downloads
// immediately on callback.
//
// Flow: Telnyx POSTs here on an inbound call -> we return TeXML that dials the
// OpenAI SIP URI -> OpenAI receives the INVITE, fires realtime.call.incoming
// to /api/telephony/incoming, which accepts the call as the Handz On agent.
//
// The response leaks nothing (it says "dial OpenAI and record"), so an
// unauthenticated POST is harmless — real routing is gated by Telnyx only
// hitting this for genuine inbound calls to our number.

import { OPENAI_SIP_URI } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

const FALLBACK_BASE = "https://www.kiconsult.no";

/** The recording callback must be an absolute URL. Derive it from the
 *  request so preview deploys call themselves, falling back to prod. */
function baseUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `https://${host}` : FALLBACK_BASE;
}

function texmlDial(req: Request): string {
  // answerOnBridge: don't answer the PSTN leg (no ringback billing / early
  // media) until OpenAI's SIP leg actually answers.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" record="record-from-answer" recordingChannels="dual" recordingStatusCallback="${baseUrl(req)}/api/telephony/telnyx-recording" recordingStatusCallbackMethod="POST">
    <Sip>${OPENAI_SIP_URI}</Sip>
  </Dial>
</Response>`;
}

export async function POST(req: Request) {
  return new Response(texmlDial(req), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

// Telnyx can be configured to GET or POST the voice webhook; support both so a
// misconfigured method doesn't silently drop calls.
export async function GET(req: Request) {
  return new Response(texmlDial(req), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
