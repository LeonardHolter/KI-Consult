import Link from "next/link";
import { redirect } from "next/navigation";
import { getClients, getProfile } from "@/lib/portal/data";
import { getRecentBotEvents } from "@/lib/admin/data";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const MUTED = "#9a9a8c";

const TYPE_LABEL: Record<string, string> = {
  deflection: "Utenfor omfang",
  error: "Feil",
  tool_error: "Verktøy-feil",
  rate_limited: "Rate-limited",
  cors_rejected: "CORS avvist",
};

const TYPE_COLOR: Record<string, string> = {
  deflection: "#a35a00",
  error: "#c2562c",
  tool_error: "#c2562c",
  rate_limited: "#8430ce",
  cors_rejected: "#8430ce",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "nå nettopp";
  if (mins < 60) return `${mins} min siden`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.floor(h / 24);
  return d === 1 ? "i går" : `${d} dager siden`;
}

/** Admin-only: drill into bot_events for one client — what actually went wrong, not just a count. */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/portal");

  const clients = await getClients();
  const { client: selected } = await searchParams;
  const activeClientId = selected ?? clients[0]?.id;
  const activeClient = clients.find((c) => c.id === activeClientId);

  const events = activeClientId ? await getRecentBotEvents(activeClientId, 100) : [];

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, fontFamily: "var(--font-schibsted), system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 24px", background: "#fff", borderBottom: `1px solid ${MUTED}44` }}>
        <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.03em" }}>
          KI&nbsp;Consult<span style={{ color: "#15A06A" }}>.no</span>
        </span>
        <Link href="/portal" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`, background: CREAM, color: INK, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
          ‹ Kunder
        </Link>
        <span style={{ marginLeft: "auto" }} />
        <form action={signOut}>
          <button style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`, background: CREAM, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
            Logg ut
          </button>
        </form>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 60px" }}>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Hendelser</h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 20px" }}>
          Alt som ikke er en vanlig samtale: feil, avviste forespørsler, og spørsmål boten ikke kunne svare på.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/portal/events?client=${c.id}`}
              style={{
                padding: "7px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, textDecoration: "none",
                background: c.id === activeClientId ? "#16190f" : "#fff",
                color: c.id === activeClientId ? "#f3efe4" : INK,
                border: `1px solid ${MUTED}44`,
              }}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {!activeClient ? (
          <div style={{ background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12, padding: 36, textAlign: "center", color: MUTED }}>
            Ingen kunder ennå.
          </div>
        ) : events.length === 0 ? (
          <div style={{ background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12, padding: 36, textAlign: "center", color: MUTED }}>
            Ingen hendelser registrert for {activeClient.name}. Bra tegn.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((e) => (
              <div key={e.id} style={{ background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: e.detail && Object.keys(e.detail).length ? 6 : 0 }}>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                      background: `${TYPE_COLOR[e.type] ?? MUTED}1a`, color: TYPE_COLOR[e.type] ?? MUTED,
                    }}
                  >
                    {TYPE_LABEL[e.type] ?? e.type}
                  </span>
                  <span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: ".04em" }}>{e.surface}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>{timeAgo(e.createdAt)}</span>
                </div>
                {e.detail && Object.keys(e.detail).length > 0 && (
                  <div style={{ fontSize: 13, color: "#3d4034", fontFamily: "var(--font-space-mono), monospace" }}>
                    {Object.entries(e.detail).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: MUTED }}>{k}:</span> {String(v).slice(0, 200)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
