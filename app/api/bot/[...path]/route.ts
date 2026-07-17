import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated proxy from the portal to a client's bot deployment.
 *
 * The dashboard used to run on the bot's own origin and asked the operator to
 * paste a shared admin key into localStorage. That can't survive the move to a
 * multi-client portal: handing Sabah that key would hand him the key for every
 * deployment that shares it, and let him call the bot's admin API directly.
 *
 * So the browser talks only to this route. We verify the Supabase session,
 * resolve which client the caller belongs to, look up that client's bot URL and
 * secret with the service-role key (server-side, never sent to the browser),
 * and forward. The customer never possesses the credential.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY!;

/**
 * Only these paths may be proxied. Without an allowlist this route would be an
 * open relay into the bot's origin for anyone with a portal login — including
 * /api/chat, which costs money per call.
 *
 * Matched against the joined path; a trailing "*" allows one path segment
 * (used for /api/recordings/<id> and its /audio child).
 */
const ALLOWED: string[] = [
  // The portal currently shows the calendar and the chat widget, nothing more.
  // The bot's admin, recordings and voice endpoints are deliberately absent:
  // an allowlist is only worth having if it lists what is actually needed.
  "calendar-view",
];

function isAllowed(path: string): boolean {
  const parts = path.split("/");
  return ALLOWED.some((rule) => {
    const r = rule.split("/");
    if (r.length !== parts.length) return false;
    return r.every((seg, i) => seg === "*" || seg === parts[i]);
  });
}

type Target = { baseUrl: string; adminSecret: string | null };

/** Resolves the caller's bot target, or null if they may not reach one. */
async function resolveTarget(req: NextRequest): Promise<Target | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  // Admins may inspect any client via ?client=<uuid>; a client user is pinned
  // to their own, and ignoring their query param is what enforces that.
  const requested = req.nextUrl.searchParams.get("client");
  const clientId =
    profile.role === "admin" ? requested ?? null : profile.client_id;
  if (!clientId) return null;

  // Service-role read: client_secrets has no RLS policies, so this is the only
  // way to reach it. Never expose the result to the browser.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/client_secrets?client_id=eq.${clientId}&select=bot_base_url,admin_secret`,
    {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as
    | { bot_base_url: string; admin_secret: string | null }[]
    | null;
  if (!rows?.length) return null;

  return { baseUrl: rows[0].bot_base_url.replace(/\/$/, ""), adminSecret: rows[0].admin_secret };
}

async function handle(req: NextRequest, path: string[]) {
  const joined = path.join("/");
  if (!isAllowed(joined)) {
    return NextResponse.json({ error: "Ikke tilgjengelig." }, { status: 404 });
  }

  const target = await resolveTarget(req);
  if (!target) {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 401 });
  }

  // Forward the caller's query string, minus our own routing param.
  const qs = new URLSearchParams(req.nextUrl.searchParams);
  qs.delete("client");
  // The allowlist is written without the /api prefix, so add it back here.
  const url = `${target.baseUrl}/api/${joined}${qs.size ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  // Injected here so it never reaches the browser.
  if (target.adminSecret) headers["x-admin-key"] = target.adminSecret;

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Boten svarer ikke." }, { status: 502 });
  }

  // Stream the body through untouched so audio downloads keep working.
  const passthrough = new Headers();
  const ct = upstream.headers.get("content-type");
  const cd = upstream.headers.get("content-disposition");
  if (ct) passthrough.set("content-type", ct);
  if (cd) passthrough.set("content-disposition", cd);
  passthrough.set("cache-control", "no-store");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: passthrough,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await ctx.params).path);
}
