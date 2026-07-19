// Lets the dashboard cancel a single bot-made booking. Available to the same
// audience that sees the booking calendar itself (the client account and any
// admin viewing on their behalf) — unlike the calendar *connection* settings,
// this is a day-to-day operational action, not admin configuration.

import { getProfile } from "@/lib/portal/data";
import { cancelBooking } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.bookingId !== "string") {
    return Response.json({ error: "missing_booking" }, { status: 400 });
  }

  // A client account is pinned to its own client regardless of what it
  // sends — same boundary the /api/bot proxy enforces for reads. Only an
  // admin may target another client via body.clientId.
  const clientId = profile.role === "admin" ? body.clientId : profile.client_id;
  if (!clientId || typeof clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }

  const result = await cancelBooking(clientId, body.bookingId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
