// Sends booking activity to the shop's own inbox — the piece that makes the
// agent's work visible where the shop already lives (Namsos reads Consort's
// overflow e-mails today; this is the same workflow with our sender).
//
// Fire-and-forget by contract: a notification failure must NEVER fail or
// delay-report the booking itself — the booking already happened. Callers
// await this (a fire-and-forget promise may be killed by the serverless
// runtime), but every failure path ends in a console.warn, not a throw.

import { Resend } from "resend";
import { loadSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { buildShopEmail, type ShopNotification } from "@/lib/notifyEmail";
import { logBotEvent } from "@/lib/botEvents";

// resend.dev is Resend's sandbox domain: mails from it only reach the Resend
// account's own address. Fine for testing; real shop delivery needs a
// verified domain and NOTIFY_FROM set to it.
const DEFAULT_FROM = "KI Consult <noreply@resend.dev>";

/**
 * Records what happened to a notification, so the admin status page can show
 * "sent today / failed today" instead of the shop's silence being the first
 * signal. Best-effort by construction (logBotEvent swallows its own errors):
 * failing to log a mail must never change whether the mail was sent.
 */
async function logNotify(
  clientId: string,
  n: ShopNotification,
  sent: boolean,
  reason?: string,
): Promise<void> {
  // Its own catch, not just logBotEvent's: a throw from here would unwind
  // into notifyShop's outer catch and turn a mail that WAS delivered into a
  // reported failure. On the callback path that means telling a caller their
  // message did not go through, seconds after it did.
  try {
    await logBotEvent({
      clientId,
      surface: "voice",
      type: sent ? "notify_sent" : "notify_failed",
      detail: { kind: n.kind, scope: n.scope, ...(reason ? { reason } : {}) },
    });
  } catch (err) {
    console.warn("[notify] kunne ikke logge utfall:", err);
  }
}

/** Cheap sanity check — the real validation is Resend accepting the address. */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}

/** The outcome is for diagnostics (the admin notify-test route shows it);
 *  every production caller ignores it — fire-and-forget stays the contract. */
export async function notifyShop(
  clientId: string,
  n: ShopNotification,
): Promise<{ sent: boolean; reason?: string; to?: string }> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      await logNotify(clientId, n, false, "RESEND_API_KEY ikke satt");
      return { sent: false, reason: "RESEND_API_KEY ikke satt" };
    }

    const settings = await loadSettings(clientId);
    const to = settings.notificationEmail;
    if (!to || !looksLikeEmail(to)) {
      const reason = "ingen notificationEmail satt for klienten";
      await logNotify(clientId, n, false, reason);
      return { sent: false, reason };
    }

    let clientName = "kunden";
    try {
      const { data } = await createServiceClient()
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();
      if (data?.name) clientName = data.name;
    } catch {
      /* name is cosmetic — send anyway */
    }

    const { subject, html, text } = buildShopEmail(clientName, n);
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: process.env.NOTIFY_FROM ?? DEFAULT_FROM,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.warn(`[notify] send failed for client ${clientId}:`, error);
      const reason = `${error.name}: ${error.message}`;
      await logNotify(clientId, n, false, reason);
      return { sent: false, reason, to };
    }
    await logNotify(clientId, n, true);
    return { sent: true, to };
  } catch (err) {
    console.warn(`[notify] failed for client ${clientId}:`, err);
    return { sent: false, reason: String(err) };
  }
}
