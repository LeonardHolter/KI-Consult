import Link from "next/link";
import { getClients, getConversations, getProfile } from "@/lib/portal/data";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const GREEN = "#15c07c";
const MUTED = "#9a9a8c";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "nå nettopp";
  if (mins < 60) return `${mins} min siden`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.floor(h / 24);
  return d === 1 ? "i går" : `${d} dager siden`;
}

export default async function SamtalerPage({
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

  const { client: selected } = await searchParams;

  const isAdmin = profile.role === "admin";
  const clients = await getClients();

  // Admins pick a client; client users are pinned to their own by RLS.
  const activeClientId = isAdmin
    ? selected ?? clients[0]?.id
    : profile.client_id ?? undefined;

  if (isAdmin && !activeClientId) {
    return (
      <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: 40 }}>
        <h1 style={{ fontSize: 22 }}>Ingen kunder ennå</h1>
        <p style={{ color: MUTED }}>Legg til en rad i <code>clients</code> for å komme i gang.</p>
      </main>
    );
  }

  const conversations = await getConversations(isAdmin ? activeClientId : undefined);
  const activeClient = clients.find((c) => c.id === activeClientId);
  const bookedCount = conversations.filter((c) => c.booked).length;

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 16, padding: "18px 24px",
          borderBottom: `1px solid ${MUTED}44`, background: "#fff", flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.03em" }}>
          KI&nbsp;Consult<span style={{ color: "#15A06A" }}>.no</span>
        </div>

        {isAdmin ? (
          <form method="GET" style={{ marginLeft: 8 }}>
            <select
              name="client"
              defaultValue={activeClientId}
              // Admin-only convenience: switch client without a submit button.
              // Progressive enhancement — the form still works without JS.
              style={{
                padding: "7px 10px", borderRadius: 8, border: `1px solid ${MUTED}66`,
                background: CREAM, color: INK, fontFamily: "inherit", fontSize: 14,
              }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="submit"
              style={{
                marginLeft: 8, padding: "7px 12px", borderRadius: 8,
                border: `1px solid ${MUTED}66`, background: CREAM, cursor: "pointer",
                fontFamily: "inherit", fontSize: 14,
              }}
            >
              Bytt
            </button>
          </form>
        ) : (
          <span style={{ color: MUTED, fontSize: 14 }}>{activeClient?.name}</span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/portal"
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
              background: CREAM, textDecoration: "none", color: INK, fontSize: 14,
              fontWeight: 600,
            }}
          >
            ‹ Kalender &amp; chat
          </Link>
          {isAdmin && (
            <span
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                background: GREEN, color: "#08231a", padding: "4px 8px", borderRadius: 5,
              }}
            >
              ADMIN
            </span>
          )}
          <form action={signOut}>
            <button
              style={{
                padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
                background: CREAM, cursor: "pointer", fontFamily: "inherit", fontSize: 14,
              }}
            >
              Logg ut
            </button>
          </form>
        </div>
      </header>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 24px 60px" }}>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Samtaler
        </h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 24px" }}>
          {conversations.length} samtaler · {bookedCount} endte i booking
        </p>

        {conversations.length === 0 ? (
          <div
            style={{
              background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12,
              padding: 36, textAlign: "center", color: MUTED,
            }}
          >
            Ingen samtaler ennå. De dukker opp her så snart noen chatter med boten.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/portal/samtaler/${c.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                  background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 10,
                  textDecoration: "none", color: INK,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                    {timeAgo(c.last_message_at)}
                  </div>
                  <div style={{ color: MUTED, fontSize: 13 }}>
                    {c.message_count} meldinger
                  </div>
                </div>
                {c.booked && (
                  <span
                    style={{
                      fontSize: 11.5, fontWeight: 700, background: GREEN,
                      color: "#08231a", padding: "4px 9px", borderRadius: 20,
                    }}
                  >
                    Booket
                  </span>
                )}
                <span style={{ color: MUTED, fontSize: 18 }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
