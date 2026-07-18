/**
 * Records notable bot events (deflections, errors, rate-limit trips, CORS
 * rejections) so they're visible in the admin dashboard instead of only in
 * server logs. Same posture as portal-log.ts: best-effort, service-role
 * write, never on the customer-facing critical path, every failure
 * swallowed and reported to the server log only.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

export const botEventsEnabled = Boolean(URL && KEY);

export type BotEventType = "deflection" | "error" | "rate_limited" | "cors_rejected" | "tool_error";

export async function logBotEvent(params: {
  clientId: string;
  surface: "chat" | "voice";
  type: BotEventType;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!botEventsEnabled) return;
  try {
    const res = await fetch(`${URL}/rest/v1/bot_events`, {
      method: "POST",
      headers: {
        apikey: KEY as string,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        client_id: params.clientId,
        surface: params.surface,
        type: params.type,
        detail: params.detail ?? {},
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`botEvents: failed to log ${params.type} (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error("botEvents: failed to log event:", err);
  }
}
