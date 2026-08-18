// Admin controls for the KPI tiles: show/hide per client, and the
// non-destructive reset ("nullstill") that sets the KPI epoch to now.
// Same shape as chat-widget/notify-email — its own route, admin-only.

import { getProfile } from "@/lib/portal/data";
import { loadSettings, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });
  const clientId = new URL(req.url).searchParams.get("client");
  if (!clientId) return Response.json({ error: "missing_client" }, { status: 400 });

  const settings = await loadSettings(clientId);
  return Response.json({
    showKpis: settings.showKpis !== false,
    kpiSince: settings.kpiSince ?? null,
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }

  const patch: { showKpis?: boolean; kpiSince?: string } = {};
  if (typeof body.show === "boolean") patch.showKpis = body.show;
  // reset: the epoch moves to NOW — old numbers stay in the database (the
  // admin cost figures need them) but vanish from the tiles.
  if (body.reset === true) patch.kpiSince = new Date().toISOString();
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing_to_do" }, { status: 400 });
  }

  const settings = await saveSettings(body.clientId, patch);
  return Response.json({
    ok: true,
    showKpis: settings.showKpis !== false,
    kpiSince: settings.kpiSince ?? null,
  });
}
