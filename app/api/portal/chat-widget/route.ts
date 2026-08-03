// Admin toggle for whether a client's own dashboard loads the chat widget.
//
// Its own route rather than another branch inside /api/portal/calendar: that
// one already carries voiceBookingMode as an admitted exception, and a second
// unrelated setting under a calendar URL is how a route stops meaning what its
// name says.
//
// Scope is deliberately narrow — this hides the widget in the PORTAL only. The
// embed on the client's real website is their own script tag and is not
// affected, so flipping this can never take the bot off their site.

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
  // Absent means shown: every client predating the field had the widget.
  return Response.json({ showChatWidget: settings.showChatWidget !== false });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }
  if (typeof body.show !== "boolean") {
    return Response.json({ error: "invalid_show" }, { status: 400 });
  }

  const settings = await saveSettings(body.clientId, { showChatWidget: body.show });
  return Response.json({ ok: true, showChatWidget: settings.showChatWidget !== false });
}
