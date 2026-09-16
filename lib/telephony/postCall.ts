// ElevenLabs post-call webhook: signature check and transcript shaping.
//
// The shop's summary e-mail is sent from request_callback, MID-CALL — the
// agent is still on the line, so there is no finished transcript to attach.
// ElevenLabs fires this webhook once the conversation ends, with the whole
// exchange in the payload. That is the only moment a full transcript exists,
// which is why the transcript travels as its own follow-up mail rather than
// being folded into the summary.
//
// Signature scheme (ElevenLabs): header `ElevenLabs-Signature` carries
// `t=<unix seconds>,v0=<hex hmac>`, and the signed payload is
// `${timestamp}.${rawBody}` HMAC-SHA256'd with the webhook secret. Same
// shape as verifyOpenAIWebhook next door, different header packing — kept
// separate so neither provider's quirks leak into the other.

import crypto from "crypto";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type PostCallVerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: string };

export function verifyElevenLabsWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now = Date.now(),
): PostCallVerifyResult {
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((kv): kv is [string, string] => kv.length === 2),
  );
  const timestamp = parts.t;
  const provided = parts.v0;
  if (!timestamp || !provided) return { ok: false, reason: "malformed_signature" };

  // Replay window, same tolerance as the OpenAI webhook next door.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > FIVE_MINUTES_MS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  // timingSafeEqual throws on length mismatch, so compare lengths first.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  try {
    return { ok: true, payload: JSON.parse(rawBody) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export type TranscriptTurn = {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
  tool_calls?: Array<{ tool_name?: string; params_as_json?: string | null }> | null;
};

export type CallbackDetails = {
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  vehicle?: string;
  message?: string;
};

/**
 * The enquiry itself, read back out of the request_callback tool call.
 * ElevenLabs replays the arguments the agent filled in — the same values the
 * mid-call mail was built from — so a client on the combined mail loses
 * nothing by not sending one while the call is still running.
 *
 * Takes the LAST such call: a caller who corrects themselves triggers a
 * second, and the correction is the one that counts.
 */
export function callbackDetails(
  turns: TranscriptTurn[] | null | undefined,
): CallbackDetails | null {
  if (!Array.isArray(turns)) return null;
  const calls = turns
    .flatMap((t) => t.tool_calls ?? [])
    .filter((c) => c?.tool_name === "request_callback");
  const last = calls[calls.length - 1];
  if (!last?.params_as_json) return null;
  try {
    const p = JSON.parse(last.params_as_json) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      customerPhone: str(p.customer_phone),
      customerName: str(p.customer_name),
      customerEmail: str(p.customer_email),
      vehicle: str(p.vehicle),
      message: str(p.message),
    };
  } catch {
    // Malformed arguments must not cost the shop the transcript.
    return null;
  }
}

/** mm:ss — a caller saying "three minutes in she got it wrong" should be able
 *  to find the spot without counting lines. */
function stamp(seconds: number | undefined): string {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds as number));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Flattens ElevenLabs' turn array into readable lines. Turns with no words
 * (a tool call on its own, an empty agent turn) are dropped — they carry
 * nothing a service adviser can read, and they break the back-and-forth
 * rhythm that makes a transcript skimmable.
 */
export function formatTranscript(turns: TranscriptTurn[] | null | undefined): string[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
    .map((t) => {
      const who = t.role === "user" ? "Kunde" : "Agent";
      const at = stamp(t.time_in_call_secs);
      return `${at ? `[${at}] ` : ""}${who}: ${(t.message as string).trim()}`;
    });
}

/** Whether the call produced an actual enquiry. Calls that ended without one
 *  — wrong numbers, hangups, someone testing the line — get no transcript
 *  mail: the shop should not have to wade through those to find the real
 *  ones, and Resend's daily cap is shared across every client. */
export function hasCallback(turns: TranscriptTurn[] | null | undefined): boolean {
  if (!Array.isArray(turns)) return false;
  return turns.some((t) =>
    (t.tool_calls ?? []).some((c) => c?.tool_name === "request_callback"),
  );
}
