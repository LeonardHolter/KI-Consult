// Conversation-initiation webhook for the ElevenLabs pilot agents: called by
// ElevenLabs when a phone call (SIP trunk) starts, BEFORE the agent speaks.
// We use it to hand the session the two things the OpenAI bridge injects at
// session-mint time — today's date/time and the caller's number (SYSTEMINFO)
// — as dynamic variables the pilot prompt references.
//
// Browser sessions never hit this route; the dashboard card passes
// date_context itself and the systeminfo placeholder defaults to empty,
// which the prompt's «finnes ingen SYSTEMINFO»-regler already handle.

import { withCallerNumber } from "@/lib/telephony/config";
import { normalizeNumber } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

/** Same Oslo-clock line lib/voiceDemo/mintClientSecret.ts prepends for the
 *  OpenAI agents (duplicated here — that one is baked into a larger prompt
 *  prefix, this one travels alone as a dynamic variable). */
function dateContextLine(): string {
  const now = new Date();
  const opts = { timeZone: "Europe/Oslo" } as const;
  const iso = new Intl.DateTimeFormat("en-CA", { ...opts, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const label = new Intl.DateTimeFormat("no", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("no", { ...opts, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return `Det er ${label} (${iso}), klokken er nå ${time}.`;
}

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_TOOLS_SECRET;
  if (!secret || req.headers.get("x-tools-secret") !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const callerDigits = normalizeNumber(String(body.caller_id ?? ""));
  // Same plausibility bar as the SIP bridge: anonymous/withheld callers get
  // no SYSTEMINFO block, and the prompt falls back to asking for a number.
  const systeminfo =
    callerDigits.length >= 8 ? withCallerNumber("", callerDigits).trimStart() : "";

  return Response.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      date_context: dateContextLine(),
      systeminfo,
    },
  });
}
