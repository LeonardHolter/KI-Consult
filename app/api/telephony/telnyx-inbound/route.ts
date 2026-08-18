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
  // Unmapped (or unknown) numbers resolve to null and the recording falls
  // back to the default line's client, matching how the call itself routes.
  const clientId = dialed ? await clientForNumber(dialed) : null;
  console.info("[telnyx-inbound] dialed", { dialed: dialed ?? "unknown", client: clientId ?? "default" });
  return new Response(inboundTexml({ base: baseUrl(req), dialed, clientId }), {
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
