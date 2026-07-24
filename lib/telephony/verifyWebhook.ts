import crypto from "crypto";

// OpenAI webhooks follow the Standard Webhooks spec (the same scheme svix
// uses): three headers — webhook-id, webhook-timestamp, webhook-signature —
// and a signing secret that starts with "whsec_". The signed payload is
// `{id}.{timestamp}.{rawBody}`, HMAC-SHA256'd with the base64-decoded secret,
// and the result base64'd. The signature header can carry several
// space-separated `v1,<sig>` values (during key rotation); any match passes.
//
// We verify by hand rather than pulling in the openai SDK just for this — it
// keeps the telephony webhook dependency-free and the logic auditable.

export type WebhookVerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: string };

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function verifyOpenAIWebhook(
  rawBody: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  },
  secret: string,
  now = Date.now(),
): WebhookVerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }

  // Reject stale timestamps to blunt replay attacks (Standard Webhooks
  // recommends a tolerance window; 5 minutes is svix's default).
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > FIVE_MINUTES_MS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  // "whsec_" prefix is a label; the actual key is the base64 after it.
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(key, "base64");
  } catch {
    return { ok: false, reason: "bad_secret" };
  }

  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBytes).update(signed).digest("base64");

  const provided = signature
    .split(" ")
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part))
    .filter(Boolean);

  const match = provided.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!match) return { ok: false, reason: "signature_mismatch" };

  try {
    return { ok: true, payload: JSON.parse(rawBody) };
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}
