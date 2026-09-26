// Outbound SMS over Telnyx — the same account the phone lines already run on.
//
// One caller today: the voice agent promising a technical-recall form link
// while the customer is still on the phone. That promise is why this sends
// and reports the outcome rather than firing and forgetting: the agent must
// not say the link is on its way before Telnyx has accepted it.

import { normalizeNumber } from "@/lib/telephony/numbers";

const BASE = "https://api.telnyx.com/v2";

export function smsConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY) && Boolean(smsSender());
}

/** The From the message goes out as. A messaging profile lets Telnyx pick the
 *  best sender itself, which is what Norwegian A2P traffic wants; a plain
 *  number works too where the line is SMS-enabled. */
function smsSender(): { messaging_profile_id: string } | { from: string } | null {
  const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
  if (profile) return { messaging_profile_id: profile };
  const from = process.env.TELNYX_SMS_FROM;
  return from ? { from } : null;
}

export type SmsResult = { sent: true; id?: string } | { sent: false; reason: string };

/**
 * Sends one SMS. Never throws: every failure comes back as `sent: false`
 * with a reason, because the caller's next move is to tell the customer
 * something truthful, not to crash the call.
 */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const key = process.env.TELNYX_API_KEY;
  const sender = smsSender();
  if (!key) return { sent: false, reason: "TELNYX_API_KEY ikke satt" };
  if (!sender) {
    return { sent: false, reason: "verken TELNYX_MESSAGING_PROFILE_ID eller TELNYX_SMS_FROM er satt" };
  }

  // Telnyx wants E.164. Norwegian numbers arrive both as 8 digits and with a
  // country code, depending on whether the caller said them or the line did.
  const digits = normalizeNumber(to);
  if (digits.length < 8) return { sent: false, reason: `ugyldig nummer: ${to}` };
  const e164 = digits.startsWith("+") ? digits : `+${digits.length === 8 ? "47" + digits : digits}`;

  try {
    const res = await fetch(`${BASE}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...sender, to: e164, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      console.warn(`[sms] Telnyx ${res.status}: ${body}`);
      // Telnyx explains the refusal in errors[]; a bare status code leaves
      // "profile has no sender for this route" and "duplicate message"
      // looking identical, and they need different fixes.
      let why = "";
      try {
        const parsed = JSON.parse(body) as {
          errors?: Array<{ code?: string; title?: string; detail?: string }>;
        };
        why = (parsed.errors ?? [])
          .map((e) => [e.code, e.title, e.detail].filter(Boolean).join(" "))
          .join("; ");
      } catch {
        why = body;
      }
      return { sent: false, reason: `Telnyx ${res.status}${why ? `: ${why}` : ""}` };
    }
    const body = (await res.json()) as { data?: { id?: string } };
    return { sent: true, id: body.data?.id };
  } catch (err) {
    console.warn("[sms] send failed:", err);
    return { sent: false, reason: String(err) };
  }
}
