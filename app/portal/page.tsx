import { getClients, getConversations, getProfile, getUsageStats } from "@/lib/portal/data";
import { getClientHealth, getDailyActivity, getEventCounts24h, getVoiceUsageStats } from "@/lib/admin/data";
import { loggingEnabled } from "@/lib/portal-log";
import { signOut } from "@/app/login/actions";
import DashboardView from "./DashboardView";
import AdminOverview from "./AdminOverview";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const MUTED = "#9a9a8c";

/**
 * Landing page after login.
 *
 * Client accounts (e.g. Sabah) always get their own dashboard — the calendar
 * and chat widget for the one client they're pinned to. Admin accounts get an
 * overview of every client with usage stats, and can drill into any one of
 * them via ?client=<id>, which renders the same dashboard the client sees.
 */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await getProfile();
  // Signed in via Supabase but with no profile row — the account exists but was
  // never tied to a client, so there is nothing it may legitimately see.
  if (!profile) {
    return (
      <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: 40 }}>
        <h1 style={{ fontSize: 22 }}>Kontoen din mangler tilgang</h1>
        <p style={{ color: MUTED, maxWidth: 460, lineHeight: 1.55 }}>
          Brukeren din er opprettet, men er ikke koblet til en kunde ennå. Ta
          kontakt med KI Consult, så ordner vi det.
        </p>
        <form action={signOut}>
          <button style={{ marginTop: 16, padding: "9px 14px", borderRadius: 8, border: `1px solid ${MUTED}66`, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
            Logg ut
          </button>
        </form>
      </main>
    );
  }

  // Deliberately ignore any ?client= query for client accounts — they only
  // ever see their own dashboard. The /api/bot proxy and RLS both enforce the
  // same boundary independently, but there's no reason to even look here.
  if (profile.role === "client") {
    // client_id is always set for the "client" role (DB constraint), but
    // pass it explicitly rather than relying on DashboardView inferring it —
    // the embed script and voice-agent button both need the id directly.
    return <DashboardView clientId={profile.client_id ?? undefined} />;
  }

  const clients = await getClients();
  const { client: selected } = await searchParams;
  const selectedClient = selected ? clients.find((c) => c.id === selected) : undefined;

  if (selectedClient) {
    return (
      <DashboardView
        clientId={selectedClient.id}
        clientLabel={selectedClient.name}
        samtalerHref={`/portal/samtaler?client=${selectedClient.id}`}
        overviewHref="/portal"
      />
    );
  }

  const [conversations, usage, eventCounts, voiceUsage, healthEntries, activity] = await Promise.all([
    getConversations(),
    getUsageStats(),
    getEventCounts24h(),
    getVoiceUsageStats(),
    Promise.all(clients.map(async (c) => [c.id, await getClientHealth(c.id)] as const)),
    getDailyActivity(),
  ]);
  const health = new Map(healthEntries);

  return (
    <AdminOverview
      clients={clients}
      conversations={conversations}
      usage={usage}
      health={health}
      eventCounts={eventCounts}
      voiceUsage={voiceUsage}
      loggingEnabled={loggingEnabled}
      activity={activity}
    />
  );
}
