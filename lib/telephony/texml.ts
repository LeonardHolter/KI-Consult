// TeXML builders shared by the two telephony routes: the inbound entry point
// (pre-roll notice + fallthrough recorded dial) and the gather action (the
// caller's press-1 answer). One module because both must produce the SAME
// dial or the press-1 branch would quietly drift from the normal one.

import { OPENAI_SIP_URI } from "@/lib/telephony/config";

export const FALLBACK_BASE = "https://www.kiconsult.no";

/** XML-escape for attribute values and text content. The bug this exists
 *  for: a raw `&` between query params in the Gather action URL made the
 *  whole document invalid XML, and Telnyx answered every call with
 *  «an application error has occurred» — the lines were dead. EVERY dynamic
 *  value embedded in TeXML goes through this. */
export function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Per-client pre-roll notices under public/telephony/. The DEFAULT notice
 * carries the AI-disclosure clause («vår digitale assistent»); a name-branded
 * override drops that clause, so the AI must be disclosed elsewhere in the
 * call — Hanz introduces itself as digital; for Namsos (Leonard's call,
 * 2026-08-18) the agent's own greeting has to carry the disclosure.
 */
const CLIENT_NOTICES: Record<string, string> = {
  // Handz On Strømmen — «Velkommen til Handz On Strømmen. Denne samtalen
  // blir tatt opp. Hvis du ikke ønsker det, trykk én.» (cedar-stemmen)
  "ad19951e-00e1-4293-8975-6c6bb1dbdad7": "notice-ad19951e-00e1-4293-8975-6c6bb1dbdad7.mp3",
  // Namsos Bilteknikk — samme ordlyd, kun navnet byttet, i damestemme
  // (marin, per Leonard): «Velkommen til Namsos Bilteknikk. Denne samtalen
  // blir tatt opp. Hvis du ikke ønsker det, trykk én.» -v2 in the name so
  // Telnyx' media cache can't serve the retired cedar take.
  "fe264dcd-84e0-4e59-8efb-cbb5e39c8125": "notice-fe264dcd-84e0-4e59-8efb-cbb5e39c8125-v2.mp3",
};

export function noticeUrl(base: string, clientId: string | null): string {
  const file = (clientId && CLIENT_NOTICES[clientId]) || "opptak-varsel.mp3";
  return `${base}/telephony/${file}`;
}

/** Absolute base for callbacks/assets, derived from the request so preview
 *  deploys call themselves, falling back to prod. */
export function baseUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `https://${host}` : FALLBACK_BASE;
}

/** SIP URI headers ride along on the INVITE. Only X--prefixed ones are
 *  forwarded, and they arrive in OpenAI's `sip_headers`, which is how
 *  /api/telephony/incoming learns which client the call belongs to. */
export function sipTarget(dialed: string | null): string {
  if (!dialed) return OPENAI_SIP_URI;
  return `${OPENAI_SIP_URI}?X-Dialed-Number=${encodeURIComponent(dialed)}`;
}

/**
 * The dial leg, with or without recording. `record: false` is the caller's
 * press-1 choice: the recording never STARTS — there is no file to promise
 * to delete, which is a stronger answer to the objection than deletion.
 * answerOnBridge is gone: the pre-roll notice already answered the call,
 * so there is no unanswered PSTN leg left to hold back.
 */
export function dialTexml(opts: {
  base: string;
  dialed: string | null;
  clientId: string | null;
  record: boolean;
}): string {
  const recordingCallback = `${opts.base}/api/telephony/telnyx-recording${
    opts.clientId ? `?client=${encodeURIComponent(opts.clientId)}` : ""
  }`;
  const recordAttrs = opts.record
    ? ` record="record-from-answer" recordingChannels="dual" recordingStatusCallback="${xml(recordingCallback)}" recordingStatusCallbackMethod="POST"`
    : "";
  return `<Dial${recordAttrs}>
    <Sip>${xml(sipTarget(opts.dialed))}</Sip>
  </Dial>`;
}

/**
 * The full inbound document: play the recording/AI notice, give the caller a
 * beat to press 1, then fall through to the recorded dial. A digit press
 * interrupts the audio and POSTs to the gather action, whose response
 * replaces everything after — including the fallthrough dial.
 */
export function inboundTexml(opts: {
  base: string;
  dialed: string | null;
  clientId: string | null;
}): string {
  const qs = new URLSearchParams();
  if (opts.clientId) qs.set("client", opts.clientId);
  if (opts.dialed) qs.set("dialed", opts.dialed);
  const gatherAction = `${opts.base}/api/telephony/gather${qs.size ? `?${qs}` : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="3" action="${xml(gatherAction)}" method="POST">
    <Play>${xml(noticeUrl(opts.base, opts.clientId))}</Play>
  </Gather>
  ${dialTexml({ ...opts, record: true })}
</Response>`;
}

/** The gather action's answer: 1 = no recording, anything else (misdial,
 *  double-press oddities) = the normal recorded dial. */
export function gatherResponseTexml(opts: {
  base: string;
  dialed: string | null;
  clientId: string | null;
  digits: string;
}): string {
  const record = opts.digits.trim() !== "1";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${dialTexml({ ...opts, record })}
</Response>`;
}
