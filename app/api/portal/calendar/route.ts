// Admin-only Google Calendar connection management, restored from the old
// single-tenant handzon-clone admin dashboard (app/api/admin/calendar) and
// made multi-tenant: every call is scoped to ?client=<id> / body.clientId
// instead of one global settings row.

import { getProfile } from "@/lib/portal/data";
import { getServiceAccount, testCalendarAccess } from "@/lib/google-calendar";
import { loadSettings, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const clientId = new URL(req.url).searchParams.get("client");
  if (!clientId) return Response.json({ error: "missing_client" }, { status: 400 });

  const sa = getServiceAccount();
  const settings = await loadSettings(clientId);
  return Response.json({
    serviceAccountEmail: sa?.client_email ?? null,
    calendarId: settings.calendarId ?? null,
    calendarName: settings.calendarName ?? null,
    locationName: settings.locationName,
    connected: Boolean(settings.calendarId && sa),
    voiceBookingMode: settings.voiceBookingMode ?? "sandbox",
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }

  // Switching where the VOICE agent books. Deliberately its own branch, and
  // handled BEFORE the service-account check: this setting is meaningful even
  // with no Google credentials configured (sandbox needs none), and flipping
  // to "live" is the moment test bookings start reaching the real calendar.
  if (body.voiceBookingMode !== undefined) {
    if (body.voiceBookingMode !== "sandbox" && body.voiceBookingMode !== "live") {
      return Response.json({ error: "invalid_voice_booking_mode" }, { status: 400 });
    }
    const settings = await saveSettings(body.clientId, {
      voiceBookingMode: body.voiceBookingMode,
    });
    return Response.json({ ok: true, voiceBookingMode: settings.voiceBookingMode });
  }

  // Everything past here talks to Google, so the credential is required.
  if (!getServiceAccount()) {
    return Response.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_KEY er ikke satt på serveren." },
      { status: 500 },
    );
  }

  if (body.disconnect) {
    const settings = await saveSettings(body.clientId, {
      calendarId: undefined,
      calendarName: undefined,
    });
    return Response.json({ ok: true, connected: false, settings });
  }

  const calendarId = String(body.calendarId ?? "").trim();
  if (!calendarId || calendarId.length > 200) {
    return Response.json({ error: "Oppgi en kalender-ID." }, { status: 400 });
  }

  // Verify we can actually read the calendar before saving.
  let calendarName: string;
  try {
    calendarName = await testCalendarAccess(calendarId);
  } catch (err) {
    return Response.json(
      {
        error:
          "Fikk ikke tilgang til kalenderen. Sjekk at kalenderen er delt med " +
          "service-kontoen (med «Gjør endringer i aktiviteter») og at ID-en er riktig. " +
          `Detaljer: ${err instanceof Error ? err.message.slice(0, 200) : "ukjent"}`,
      },
      { status: 400 },
    );
  }

  const settings = await saveSettings(body.clientId, {
    calendarId,
    calendarName,
    ...(typeof body.locationName === "string" && body.locationName.trim()
      ? { locationName: body.locationName.trim() }
      : {}),
  });
  return Response.json({ ok: true, connected: true, calendarName, settings });
}
