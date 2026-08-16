// Admin setting: where a client's booking/message e-mails go (lib/notify.ts
// reads it per send). Its own route for the same reason as chat-widget —
// /api/portal/calendar already carries one unrelated setting as an admitted
// exception, and this one is not calendar-shaped either.

import { getProfile } from "@/lib/portal/data";
import { looksLikeEmail } from "@/lib/notify";
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
  return Response.json({ notificationEmail: settings.notificationEmail ?? "" });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string" || typeof body.email !== "string") {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const email = body.email.trim();
  // Empty clears the address — that is how a shop opts back out.
  if (email !== "" && !looksLikeEmail(email)) {
    return Response.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
  }

  const settings = await saveSettings(body.clientId, {
    notificationEmail: email === "" ? undefined : email,
  });
  return Response.json({ ok: true, notificationEmail: settings.notificationEmail ?? "" });
}
