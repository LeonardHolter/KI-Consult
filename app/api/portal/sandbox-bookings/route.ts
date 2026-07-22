// Wipes the client's sandbox (test-calendar) bookings in one go, so a test
// round can start from a clean grid. Admin only. Touches ONLY the sandbox
// blob store — clearSandboxBookings goes through the demo-store writer,
// which by construction never reaches Google Calendar.

import { getProfile } from "@/lib/portal/data";
import { clearSandboxBookings } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const { removed } = await clearSandboxBookings(clientId);
  return Response.json({ ok: true, removed });
}
