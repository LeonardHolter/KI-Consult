import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { Client, ConversationRow, UsageStats } from "@/lib/portal/data";

const CREAM = "#f3efe4";
const INK = "#16190f";
const GREEN = "#15c07c";
const MUTED = "#9a9a8c";

function timeAgo(iso: string | null): string {
  if (!iso) return "aldri";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "nå nettopp";
  if (mins < 60) return `${mins} min siden`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.floor(h / 24);
  return d === 1 ? "i går" : `${d} dager siden`;
}

// Claude Opus 4.8 pricing, per million tokens — the bot's chat route
// (handzon-clone/app/api/chat/route.ts) hardcodes model: "claude-opus-4-8".
// Update these if that ever changes. Cache write reflects the route's default
// 5-minute ephemeral TTL (no explicit "1h"), and cache read is ~0.1x input.
const PRICE_PER_MILLION = {
  input: 5.0,
  output: 25.0,
  cacheWrite: 5.0 * 1.25,
  cacheRead: 5.0 * 0.1,
};

function estimateCostUsd(u: UsageStats): number {
  return (
    (u.input_tokens * PRICE_PER_MILLION.input +
      u.output_tokens * PRICE_PER_MILLION.output +
      u.cache_creation_input_tokens * PRICE_PER_MILLION.cacheWrite +
      u.cache_read_input_tokens * PRICE_PER_MILLION.cacheRead) /
    1_000_000
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

type Stats = {
  conversations: number;
  messages: number;
  booked: number;
  lastActivity: string | null;
};

/**
 * Landing page for admin accounts: every client, usage at a glance, and one
 * click into either their live dashboard or their conversation log.
 *
 * Stats are computed here from the same `conversations` rows the samtaler
 * page already fetches (capped at the 200 most recent across all clients) —
 * fine while there are a handful of clients; worth a proper aggregate query
 * once that list grows.
 */
export default function AdminOverview({
  clients,
  conversations,
  usage,
}: {
  clients: Client[];
  conversations: ConversationRow[];
  usage: UsageStats[];
}) {
  const statsByClient = new Map<string, Stats>();
  for (const c of conversations) {
    const s = statsByClient.get(c.client_id) ?? {
      conversations: 0,
      messages: 0,
      booked: 0,
      lastActivity: null,
    };
    s.conversations += 1;
    s.messages += c.message_count;
    if (c.booked) s.booked += 1;
    if (!s.lastActivity || c.last_message_at > s.lastActivity) {
      s.lastActivity = c.last_message_at;
    }
    statsByClient.set(c.client_id, s);
  }

  const usageByClient = new Map(usage.map((u) => [u.client_id, u]));
  const totalCostUsd = usage.reduce((sum, u) => sum + estimateCostUsd(u), 0);

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
        <span
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
            background: GREEN, color: "#08231a", padding: "4px 8px", borderRadius: 5,
          }}
        >
          ADMIN
        </span>
        <Link
          href="/portal/voice-demo"
          style={{
            padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
            background: CREAM, color: INK, textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          Realtime-demo — tuning
        </Link>
        <form action={signOut} style={{ marginLeft: "auto" }}>
          <button
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
              background: CREAM, cursor: "pointer", fontFamily: "inherit", fontSize: 14,
            }}
          >
            Logg ut
          </button>
        </form>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 60px" }}>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Kunder
        </h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 24px" }}>
          {clients.length} {clients.length === 1 ? "kunde" : "kunder"}
          {" · "}
          est. total kostnad{" "}
          <strong style={{ color: INK }}>{fmtUsd(totalCostUsd)}</strong> (Opus 4.8)
        </p>

        {clients.length === 0 ? (
          <div
            style={{
              background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12,
              padding: 36, textAlign: "center", color: MUTED,
            }}
          >
            Ingen kunder ennå. Legg til en rad i <code>clients</code> for å komme i gang.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {clients.map((client) => {
              const s = statsByClient.get(client.id) ?? {
                conversations: 0, messages: 0, booked: 0, lastActivity: null,
              };
              const u = usageByClient.get(client.id);
              const costUsd = u ? estimateCostUsd(u) : 0;
              return (
                <div
                  key={client.id}
                  style={{
                    background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12,
                    padding: "18px 20px", display: "flex", flexWrap: "wrap",
                    alignItems: "center", gap: 20,
                  }}
                >
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</div>
                    <div style={{ color: MUTED, fontSize: 12.5 }}>
                      Sist aktiv {timeAgo(s.lastActivity)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 22, marginLeft: "auto", fontSize: 13.5 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{s.conversations}</div>
                      <div style={{ color: MUTED }}>samtaler</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{s.messages}</div>
                      <div style={{ color: MUTED }}>meldinger</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: s.booked > 0 ? "#0d6b47" : INK }}>
                        {s.booked}
                      </div>
                      <div style={{ color: MUTED }}>bookinger</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {u ? fmtTokens(u.input_tokens + u.output_tokens) : "0"}
                      </div>
                      <div style={{ color: MUTED }}>tokens</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtUsd(costUsd)}</div>
                      <div style={{ color: MUTED }}>est. kostnad</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <Link
                      href={`/portal?client=${client.id}`}
                      className="btn-primary"
                      style={{
                        padding: "9px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                        color: "#08231a", textDecoration: "none",
                      }}
                    >
                      Åpne dashboard
                    </Link>
                    <Link
                      href={`/portal/samtaler?client=${client.id}`}
                      style={{
                        padding: "9px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                        border: `1px solid ${MUTED}66`, background: CREAM, color: INK,
                        textDecoration: "none",
                      }}
                    >
                      Samtaler
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
