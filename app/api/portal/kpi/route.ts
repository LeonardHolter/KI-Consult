// Dashboard KPI tiles. Session-scoped like recordings/customers: a client
// account is pinned to its own client, an admin picks with ?client=. The
// heavy lifting (and the service-role reads voice_usage needs) lives in
// lib/kpi.ts — tenancy is decided HERE, before any data is touched.

import { getProfile } from "@/lib/portal/data";
import { buildClientKpis } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const clientId =
    profile.role === "admin"
      ? new URL(req.url).searchParams.get("client")
      : profile.client_id;
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  return Response.json(await buildClientKpis(clientId));
}
