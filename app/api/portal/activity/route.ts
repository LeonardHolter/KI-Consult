// Per-day call activity for the dashboard chart. Tenancy is decided HERE,
// before any data is touched — same contract as /api/portal/kpi: a client
// account is pinned to its own client, an admin picks one with ?client=.

import { getProfile } from "@/lib/portal/data";
import { getClientCallActivity } from "@/lib/callActivity";
import { loadSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const clientId =
    profile.role === "admin" ? new URL(req.url).searchParams.get("client") : profile.client_id;
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  // Follows the KPI switch: a client whose numbers are hidden should not get
  // the same numbers back as a drawing.
  if ((await loadSettings(clientId)).showKpis === false) {
    return Response.json({ show: false });
  }

  return Response.json({ show: true, days: await getClientCallActivity(clientId, 14) });
}
