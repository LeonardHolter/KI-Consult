// The client's customer list: every customer the agent has booked, grouped
// by phone, as JSON for the dashboard panel or CSV for download. Session-
// scoped like the recordings route: a client account is pinned to its own
// client, an admin picks with ?client=.

import { getProfile } from "@/lib/portal/data";
import { listAgentBookings } from "@/lib/slots";
import { buildCustomerRows, customersToCsv } from "@/lib/customers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const clientId =
    profile.role === "admin" ? url.searchParams.get("client") : profile.client_id;
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const rows = buildCustomerRows(await listAgentBookings(clientId));

  if (url.searchParams.get("format") === "csv") {
    return new Response(customersToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kundeliste.csv"',
        "Cache-Control": "no-store",
      },
    });
  }
  return Response.json({ customers: rows });
}
