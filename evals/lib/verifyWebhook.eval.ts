import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyOpenAIWebhook } from "@/lib/telephony/verifyWebhook";

// The webhook is the only public, unauthenticated entry point to the phone
// bridge — accept an unsigned request and anyone could drive Handz On's line.
// These pin the Standard Webhooks verification: a valid signature passes, and
// every way to forge/replay one fails closed.

const SECRET_B64 = Buffer.from("super-secret-signing-key").toString("base64");
const SECRET = `whsec_${SECRET_B64}`;

function sign(id: string, ts: string, body: string, secret = SECRET_B64): string {
  const key = Buffer.from(secret, "base64");
  return crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

const NOW = 1_770_000_000_000;
const TS = String(Math.floor(NOW / 1000));
const BODY = JSON.stringify({ type: "realtime.call.incoming", data: { call_id: "rtc_abc" } });

describe("verifyOpenAIWebhook", () => {
  it("accepts a correctly signed request and returns the parsed payload", () => {
    const res = verifyOpenAIWebhook(
      BODY,
      { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY)}` },
      SECRET,
      NOW,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toMatchObject({ type: "realtime.call.incoming" });
  });

  it("accepts when multiple signatures are present (key rotation)", () => {
    const good = sign("msg_1", TS, BODY);
    const res = verifyOpenAIWebhook(
      BODY,
      { id: "msg_1", timestamp: TS, signature: `v1,deadbeef v1,${good}` },
      SECRET,
      NOW,
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const res = verifyOpenAIWebhook(
      BODY.replace("rtc_abc", "rtc_evil"),
      { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY)}` },
      SECRET,
      NOW,
    );
    expect(res).toMatchObject({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a wrong signing secret", () => {
    const res = verifyOpenAIWebhook(
      BODY,
      { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY, Buffer.from("other").toString("base64"))}` },
      SECRET,
      NOW,
    );
    expect(res).toMatchObject({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a stale timestamp (replay window)", () => {
    const res = verifyOpenAIWebhook(
      BODY,
      { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY)}` },
      SECRET,
      NOW + 10 * 60 * 1000, // 10 min later
    );
    expect(res).toMatchObject({ ok: false, reason: "timestamp_out_of_tolerance" });
  });

  it("rejects missing headers", () => {
    const res = verifyOpenAIWebhook(BODY, { id: null, timestamp: TS, signature: "v1,x" }, SECRET, NOW);
    expect(res).toMatchObject({ ok: false, reason: "missing_headers" });
  });
});
