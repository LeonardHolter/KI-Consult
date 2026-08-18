// Admin-only: sends one clearly-marked test notification through the exact
// same path real bookings use (notifyShop -> Resend), and returns the
// outcome instead of swallowing it. Exists because the Resend key lives only
// in Vercel's env (sensitive), so "does the shop e-mail actually deliver?"
// can't be answered from a laptop — this route answers it from production.
//
// Guarded by NOTIFY_TEST_SECRET (env, admin-held). No secret configured =
// the route is dead, so it can never become an open mail cannon.

import { notifyShop } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.NOTIFY_TEST_SECRET;
  const given = req.headers.get("x-notify-test-secret");
  if (!secret || !given || given !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { clientId?: string };
  const clientId = body.clientId ?? "fe264dcd-84e0-4e59-8efb-cbb5e39c8125"; // Namsos

  const result = await notifyShop(clientId, {
    kind: "booking",
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    customerName: "Test-Kunde",
    customerPhone: "+47 982 52 356",
    service: "TEST av e-postvarsling — kan ignoreres (KI Consult)",
    scope: "sandbox",
  });
  return Response.json(result, { status: result.sent ? 200 : 502 });
}
