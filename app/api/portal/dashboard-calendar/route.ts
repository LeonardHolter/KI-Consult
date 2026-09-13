// Admin toggle for whether a client's own dashboard shows the booking
// calendar. Same shape and reasoning as /api/portal/chat-widget: a setting
// of its own rather than a branch under the calendar-connection route.
//
// Off is for clients whose agent never books — an intake agent that hands
// every call to a service desk has no calendar to mirror, and an empty grid
// with a "Testkalender" switch reads as a broken product, not a design.

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
  // Absent means shown: every client predating the field had the calendar.
  return Response.json({ showCalendar: settings.showCalendar !== false });
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

  const settings = await saveSettings(body.clientId, { showCalendar: body.show });
  return Response.json({ ok: true, showCalendar: settings.showCalendar !== false });
}
