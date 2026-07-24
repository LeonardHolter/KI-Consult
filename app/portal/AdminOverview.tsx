import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { Client, ConversationRow, UsageStats } from "@/lib/portal/data";
import type { ClientHealth, DayActivity, EventCounts24h, VoiceUsageStats } from "@/lib/admin/data";
import ClientBillingForm from "./ClientBillingForm";
import OnboardingPanel from "./OnboardingPanel";
import ActivityCharts from "./ActivityCharts";

const CREAM = "#f3efe4";
const INK = "#16190f";
const GREEN = "#15c07c";
const MUTED = "#9a9a8c";
const RED = "#c2562c";

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
// hardcodes model: "claude-opus-4-8". Update these if that ever changes.
// Cache write reflects the route's default 5-minute ephemeral TTL, cache
// read is ~0.1x input.
const CHAT_PRICE_PER_MILLION = {
  input: 5.0,
  output: 25.0,
  cacheWrite: 5.0 * 1.25,
  cacheRead: 5.0 * 0.1,
};

// gpt-realtime pricing, per million tokens — approximate, blended
// text+audio rate. OpenAI prices audio and text tokens separately and this
// doesn't distinguish them (the Realtime usage event doesn't cleanly split
// them either), so treat this as directional, not exact — verify against
// platform.openai.com/docs/pricing before using it for real billing.
const VOICE_PRICE_PER_MILLION = {
  input: 32.0,
  output: 64.0,
  cacheRead: 32.0 * 0.1,
};

function estimateChatCostUsd(u: UsageStats): number {
  return (
    (u.input_tokens * CHAT_PRICE_PER_MILLION.input +
      u.output_tokens * CHAT_PRICE_PER_MILLION.output +
      u.cache_creation_input_tokens * CHAT_PRICE_PER_MILLION.cacheWrite +
      u.cache_read_input_tokens * CHAT_PRICE_PER_MILLION.cacheRead) /
    1_000_000
  );
}

function estimateVoiceCostUsd(v: VoiceUsageStats): number {
  return (
    (v.inputTokens * VOICE_PRICE_PER_MILLION.input +
      v.outputTokens * VOICE_PRICE_PER_MILLION.output +
      v.cacheReadInputTokens * VOICE_PRICE_PER_MILLION.cacheRead) /
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

function fmtMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

type Stats = {
  conversations: number;
  messages: number;
  booked: number;
  lastActivity: string | null;
};

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700,
        padding: "3px 8px", borderRadius: 999, background: ok ? "#e4f7ee" : "#fdecea",
        color: ok ? "#0d6b47" : RED,
      }}
      title={ok ? `${label}: OK` : `${label}: mangler`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#15c07c" : RED }} />
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<Client["status"], string> = {
  trial: "Prøve",
  active: "Aktiv",
  paused: "Pauset",
  churned: "Avsluttet",
};
const STATUS_COLOR: Record<Client["status"], string> = {
  trial: "#a35a00",
  active: "#0d6b47",
  paused: "#9a9a8c",
  churned: "#c2562c",
};

/**
 * Landing page for admin accounts: every client, health, usage, and cost at
 * a glance, plus one click into their dashboard, conversations, or event log.
 */
export default function AdminOverview({
  clients,
  conversations,
  usage,
  health,
  eventCounts,
  voiceUsage,
  loggingEnabled,
  activity,
}: {
  clients: Client[];
  conversations: ConversationRow[];
  usage: UsageStats[];
  health: Map<string, ClientHealth>;
  eventCounts: Map<string, EventCounts24h>;
  voiceUsage: Map<string, VoiceUsageStats>;
  loggingEnabled: boolean;
  activity?: DayActivity[];
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
  const totalChatCostUsd = usage.reduce((sum, u) => sum + estimateChatCostUsd(u), 0);
  const totalVoiceCostUsd = [...voiceUsage.values()].reduce((sum, v) => sum + estimateVoiceCostUsd(v), 0);

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
        <Link
          href="/portal/events"
          style={{
            padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
            background: CREAM, color: INK, textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          Hendelser
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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
        {!loggingEnabled && (
          <div
            style={{
              background: "#fdecea", border: "1px solid #f0a898", color: "#8a1f1f",
              borderRadius: 12, padding: "14px 18px", marginBottom: 20, fontSize: 14, fontWeight: 600,
            }}
          >
            ⚠ Samtale-logging er AV globalt (SUPABASE_URL/SUPABASE_SECRET_KEY mangler). Ingen samtaler
            eller hendelser blir registrert for noen kunder akkurat nå.
          </div>
        )}

        <OnboardingPanel clients={clients} />

        {activity && <ActivityCharts days={activity} />}

        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Kunder
        </h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 24px" }}>
          {clients.length} {clients.length === 1 ? "kunde" : "kunder"}
          {" · "}
          est. kostnad{" "}
          <strong style={{ color: INK }}>{fmtUsd(totalChatCostUsd + totalVoiceCostUsd)}</strong>
          {" "}({fmtUsd(totalChatCostUsd)} chat + {fmtUsd(totalVoiceCostUsd)} tale)
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
              const chatCostUsd = u ? estimateChatCostUsd(u) : 0;
              const v = voiceUsage.get(client.id);
              const voiceCostUsd = v ? estimateVoiceCostUsd(v) : 0;
              const h = health.get(client.id);
              const ev = eventCounts.get(client.id);
              const conversionPct = s.conversations > 0 ? Math.round((s.booked / s.conversations) * 100) : null;
              const totalIssues = ev
                ? ev.errors + ev.toolErrors + ev.rateLimited + ev.corsRejected
                : 0;

              return (
                <div
                  key={client.id}
                  style={{
                    background: "#fff", border: `1px solid ${MUTED}33`, borderRadius: 12,
                    padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
                    <div style={{ minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</span>
                        <span
                          style={{
                            fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                            background: `${STATUS_COLOR[client.status]}1a`, color: STATUS_COLOR[client.status],
                          }}
                        >
                          {STATUS_LABEL[client.status]}
                        </span>
                      </div>
                      <div style={{ color: MUTED, fontSize: 12.5 }}>
                        Sist aktiv {timeAgo(s.lastActivity)}
                        {client.plan && ` · ${client.plan}`}
                        {client.monthly_price_nok != null && ` · ${client.monthly_price_nok.toLocaleString("no-NO")} kr/mnd`}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <HealthDot ok={h?.calendarConnected ?? false} label="Kalender" />
                      <HealthDot ok={h?.chatConfigured ?? false} label="Chat" />
                      <HealthDot ok={h?.voiceConfigured ?? false} label="Tale" />
                    </div>

                    <div style={{ display: "flex", gap: 22, marginLeft: "auto", fontSize: 13.5 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{s.conversations}</div>
                        <div style={{ color: MUTED }}>samtaler</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: s.booked > 0 ? "#0d6b47" : INK }}>
                          {conversionPct !== null ? `${conversionPct}%` : "—"}
                        </div>
                        <div style={{ color: MUTED }}>booket ({s.booked})</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {u ? fmtTokens(u.input_tokens + u.output_tokens) : "0"}
                        </div>
                        <div style={{ color: MUTED }}>chat-tokens</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{v ? fmtMinutes(v.totalSeconds) : "0 min"}</div>
                        <div style={{ color: MUTED }}>tale ({v?.calls ?? 0} samtaler)</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtUsd(chatCostUsd + voiceCostUsd)}</div>
                        <div style={{ color: MUTED }}>est. kostnad</div>
                      </div>
                      <Link
                        href={`/portal/events?client=${client.id}`}
                        style={{ textDecoration: "none", color: totalIssues > 0 || (ev?.deflections ?? 0) > 0 ? RED : MUTED }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {ev ? ev.errors + ev.toolErrors + ev.rateLimited + ev.corsRejected + ev.deflections : 0}
                        </div>
                        <div>hendelser (24t)</div>
                      </Link>
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

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, borderTop: `1px solid ${MUTED}22`, paddingTop: 12 }}>
                    <div style={{ fontSize: 12.5, color: MUTED, flex: 1 }}>
                      {client.contact_email || client.contact_phone ? (
                        <>
                          {client.contact_email && <span>{client.contact_email}</span>}
                          {client.contact_email && client.contact_phone && " · "}
                          {client.contact_phone && <span>{client.contact_phone}</span>}
                        </>
                      ) : (
                        "Ingen kontaktinfo registrert"
                      )}
                    </div>
                    <ClientBillingForm client={client} />
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
