// Admin onboarding for new clients: create the client row, seed starter
// prompts for both bot surfaces, report integration status, and create the
// client's portal user. Strictly additive to the existing setup — nothing
// here touches existing clients' rows unless explicitly asked to invite a
// user for them.
//
// Writes use the service-role client: `clients` and `profiles` have no
// admin INSERT policies (they were seeded by hand until now), and the
// service role is the established RLS-bypass path for server-side writes.
// The admin gate is therefore enforced HERE, before any service call.

import crypto from "crypto";
import { getProfile } from "@/lib/portal/data";
import { createServiceClient } from "@/lib/supabase/service";
import { loadSettings } from "@/lib/settings";
import { getServiceAccount } from "@/lib/google-calendar";
import {
  chatStarterInstructions,
  chatStarterKnowledge,
  voiceStarterInstructions,
} from "@/lib/onboardingTemplates";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin" ? profile : null;
}

/** Integration checklist for one client — what's done, what's left. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const supabase = createServiceClient();
  const [chat, voice, users, settings] = await Promise.all([
    supabase
      .from("chat_bot_settings")
      .select("instructions, knowledge_base")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("voice_demo_settings").select("instructions").eq("client_id", clientId).maybeSingle(),
    supabase.from("profiles").select("id").eq("client_id", clientId),
    loadSettings(clientId),
  ]);

  const needsFilling = (s: string | undefined | null) => !s || s.includes("[FYLL INN");
  return Response.json({
    status: {
      chatSeeded: Boolean(chat.data),
      chatCustomized: Boolean(chat.data) && !needsFilling(chat.data?.instructions) && !needsFilling(chat.data?.knowledge_base),
      voiceSeeded: Boolean(voice.data),
      voiceCustomized: Boolean(voice.data) && !needsFilling(voice.data?.instructions),
      calendarConnected: Boolean(settings.calendarId && getServiceAccount()),
      voiceBookingMode: settings.voiceBookingMode,
      userCount: users.data?.length ?? 0,
    },
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const supabase = createServiceClient();

  if (body.action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!name) return Response.json({ error: "Navn mangler." }, { status: 400 });
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return Response.json(
        { error: "Slug må være små bokstaver/tall med bindestreker, f.eks. handzon-strommen." },
        { status: 400 },
      );
    }

    const existing = await supabase.from("clients").select("id").eq("slug", slug).maybeSingle();
    if (existing.data) {
      return Response.json({ error: `Slug «${slug}» er allerede i bruk.` }, { status: 409 });
    }

    const inserted = await supabase
      .from("clients")
      .insert({ name, slug })
      .select("id, name, slug")
      .single();
    if (inserted.error || !inserted.data) {
      return Response.json({ error: inserted.error?.message ?? "Kunne ikke opprette kunden." }, { status: 500 });
    }
    const client = inserted.data;

    // Seed both bot surfaces with structured starter prompts. Non-fatal on
    // conflict (upsert): re-running create for a half-onboarded client must
    // never overwrite prompts someone already customized — hence the
    // ignoreDuplicates flag rather than a blind overwrite.
    const chatSeed = await supabase.from("chat_bot_settings").upsert(
      {
        client_id: client.id,
        bot_name: "Assistenten",
        company_name: name,
        welcome_message: `Hei! 👋 Jeg er ${name} sin digitale assistent. Hva kan jeg hjelpe deg med?`,
        instructions: chatStarterInstructions(name),
        knowledge_base: chatStarterKnowledge(name),
      },
      { onConflict: "client_id", ignoreDuplicates: true },
    );
    const voiceSeed = await supabase.from("voice_demo_settings").upsert(
      {
        id: slug,
        client_id: client.id,
        instructions: voiceStarterInstructions(name),
      },
      { onConflict: "client_id", ignoreDuplicates: true },
    );
    if (chatSeed.error || voiceSeed.error) {
      return Response.json(
        {
          error: `Kunden ble opprettet, men prompt-seeding feilet: ${chatSeed.error?.message ?? voiceSeed.error?.message}`,
          client,
        },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, client });
  }

  if (body.action === "invite") {
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!clientId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ error: "Gyldig e-post og klient kreves." }, { status: 400 });
    }

    // One-time password shown to the admin exactly once; the user should
    // change it after first login.
    const password = crypto.randomBytes(9).toString("base64url");
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      return Response.json(
        { error: created.error?.message ?? "Kunne ikke opprette brukeren." },
        { status: 500 },
      );
    }

    const profile = await supabase.from("profiles").insert({
      id: created.data.user.id,
      client_id: clientId,
      role: "client",
      full_name: fullName || null,
    });
    if (profile.error) {
      // Roll back the auth user so a failed profile doesn't leave a dangling
      // login with no client binding.
      await supabase.auth.admin.deleteUser(created.data.user.id).catch(() => {});
      return Response.json({ error: profile.error.message }, { status: 500 });
    }

    return Response.json({ ok: true, email, password });
  }

  return Response.json({ error: "unknown_action" }, { status: 400 });
}
