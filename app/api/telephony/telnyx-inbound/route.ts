// Telnyx TeXML entry point for the client phone lines.
//
// Why this exists: an inbound call must reach OpenAI's SIP endpoint with the
// OpenAI PROJECT id as the SIP user part (sip:proj_…@sip.api.openai.com) —
// that's how OpenAI knows which project the call belongs to. A plain Telnyx
// FQDN connection forwards the DIALED NUMBER as the user part, which OpenAI
// can't route. A TeXML <Dial><Sip> lets us specify the exact target URI.
//
// Pre-roll notice: before the agent answers, the caller hears a short
// recorded message — «du kommer til vår digitale assistent, samtalen tas
// opp, trykk 1 hvis du ikke ønsker det». That one message discharges BOTH
// transparency duties (GDPR information duty for the recording, AI-Act
// disclosure for the agent) at the telephony layer, so the agent's prompt
// carries neither, and pressing 1 means the recording never starts (see
// /api/telephony/gather). No keypress falls through to the recorded dial.
//
// Recording: the Dial carries record attributes so Telnyx records both legs
// (dual channel: caller left, agent right) and POSTs the finished recording
// to /api/telephony/telnyx-recording, which stores it in the «Samtaleopptak»
// panel. Telnyx recording URLs are only valid ~10 minutes, so that route
// downloads immediately on callback.
//
// The response leaks nothing (it says "play a notice, dial OpenAI"), so an
// unauthenticated POST is harmless — real routing is gated by Telnyx only
// hitting this for genuine inbound calls to our numbers.

import { baseUrl, inboundTexml } from "@/lib/telephony/texml";
import { PHONE_CLIENT_ID } from "@/lib/telephony/config";
import { clientForNumber } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

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

async function respond(req: Request): Promise<Response> {
  const dialed = await dialedNumber(req);
  // The default line (Handz On) has NO row in the number map — its mapping
  // is the PHONE_CLIENT_ID fallback, same as /api/telephony/incoming uses.
  // Without this the default line resolved to null here and got the generic
  // pre-roll instead of its name-branded one.
  const clientId = (dialed ? await clientForNumber(dialed) : null) ?? PHONE_CLIENT_ID;
  // Minted per call and threaded through the SIP INVITE, the gather action
  // and the Dial action — it's what lets the call runner's transfer request
  // find its way back to THIS call's dial-done callback.
  const transferKey = crypto.randomUUID();
  console.info("[telnyx-inbound] dialed", { dialed: dialed ?? "unknown", client: clientId ?? "default" });
  return new Response(inboundTexml({ base: baseUrl(req), dialed, clientId, transferKey }), {
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
