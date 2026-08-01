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
import { clientForNumber } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

const FALLBACK_BASE = "https://www.kiconsult.no";

/** The recording callback must be an absolute URL. Derive it from the
 *  request so preview deploys call themselves, falling back to prod. */
function baseUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `https://${host}` : FALLBACK_BASE;
}

/**
 * The number the caller dialed, from TeXML's own request parameters (query
 * string on GET, form body on POST).
 *
 * This is the ONLY place in the chain where the dialed number exists. The
 * INVITE we send onward has the OpenAI PROJECT id as its user part, so by the
 * time the call surfaces as realtime.call.incoming, nothing in the To header
 * says which of our lines rang — which is why every call routed to the
 * fallback client until this was passed through explicitly.
 */
async function dialedNumber(req: Request): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get("To");
  if (fromQuery) return fromQuery;
  try {
    const form = await req.formData();
    const to = form.get("To");
    return typeof to === "string" && to ? to : null;
  } catch {
    // GET, or a body that isn't form-encoded — nothing to read.
    return null;
  }
}

/** SIP URI headers ride along on the INVITE. Only X--prefixed ones are
 *  forwarded, and they arrive in OpenAI's `sip_headers`, which is how
 *  /api/telephony/incoming learns which client the call belongs to. */
function sipTarget(dialed: string | null): string {
  if (!dialed) return OPENAI_SIP_URI;
  return `${OPENAI_SIP_URI}?X-Dialed-Number=${encodeURIComponent(dialed)}`;
}

/**
 * Where Telnyx posts the finished recording. The client id rides along,
 * because this route is the only one that can work it out: the recording
 * callback arrives after the call, carrying nothing that identifies the line
 * that rang. Without it every phone recording landed in one hardcoded
 * client's panel — including recordings of another client's customers.
 */
function recordingCallback(req: Request, clientId: string | null): string {
  const base = `${baseUrl(req)}/api/telephony/telnyx-recording`;
  return clientId ? `${base}?client=${encodeURIComponent(clientId)}` : base;
}

function texmlDial(req: Request, dialed: string | null, clientId: string | null): string {
  // answerOnBridge: don't answer the PSTN leg (no ringback billing / early
  // media) until OpenAI's SIP leg actually answers.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" record="record-from-answer" recordingChannels="dual" recordingStatusCallback="${recordingCallback(req, clientId)}" recordingStatusCallbackMethod="POST">
    <Sip>${sipTarget(dialed)}</Sip>
  </Dial>
</Response>`;
}

async function respond(req: Request): Promise<Response> {
  const dialed = await dialedNumber(req);
  // Unmapped (or unknown) numbers resolve to null and the recording falls
  // back to the default line's client, matching how the call itself routes.
  const clientId = dialed ? await clientForNumber(dialed) : null;
  console.info("[telnyx-inbound] dialed", { dialed: dialed ?? "unknown", client: clientId ?? "default" });
  return new Response(texmlDial(req, dialed, clientId), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

export async function POST(req: Request) {
  return respond(req);
}

// Telnyx can be configured to GET or POST the voice webhook; support both so a
// misconfigured method doesn't silently drop calls.
export async function GET(req: Request) {
  return respond(req);
}
