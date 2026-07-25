import Link from "next/link";
import { getProfile } from "@/lib/portal/data";
import { overallState, runStatusChecks, type CheckState } from "@/lib/status/checks";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const MUTED = "#9a9a8c";

/**
 * Admin-only live health page for every external service we depend on.
 *
 * Deliberately admin-gated: it names env vars, vendor status codes and the
 * Telnyx balance. A client user seeing "nøkkelen ble avvist (401)" learns
 * nothing useful and something they shouldn't.
 *
 * Probes run on every load — no cron, no history table. The question this
 * answers is "is it broken RIGHT NOW, and is it us or them?", which is the
 * question we actually had when the phone went quiet.
 */

const STYLE: Record<CheckState, { dot: string; label: string; text: string }> = {
  ok: { dot: "#15c07c", label: "Oppe", text: INK },
  degraded: { dot: "#e0a92b", label: "Ustabil", text: INK },
  down: { dot: "#d9534f", label: "Nede", text: "#8f2e2b" },
  unconfigured: { dot: MUTED, label: "Ikke satt opp", text: MUTED },
};

const HEADLINE: Record<CheckState, string> = {
  ok: "Alt virker",
  degraded: "Virker, men noe trenger tilsyn",
  down: "Noe er nede",
  unconfigured: "Alt oppe — men noe mangler oppsett",
};

export default async function StatusPage() {
  const profile = await getProfile();

  // Same treatment as every other portal page: no profile row means no access.
  if (!profile || profile.role !== "admin") {
    return (
      <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: 40 }}>
        <h1 style={{ fontSize: 22 }}>Ingen tilgang</h1>
        <p style={{ color: MUTED, maxWidth: 460, lineHeight: 1.55 }}>
          Systemstatus er forbeholdt administratorer.
        </p>
        <Link href="/portal" style={{ color: INK, fontSize: 14 }}>
          Tilbake til dashbordet
        </Link>
      </main>
    );
  }

  const results = await runStatusChecks();
  const overall = overallState(results);
  const checkedAt = new Date().toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo" });

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
        <span style={{ color: MUTED, fontSize: 14 }}>Systemstatus</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {/* A plain link to this same page: re-running the probes is just a
              reload, and force-dynamic guarantees it isn't served from cache. */}
          <Link
            href="/portal/status"
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
              background: CREAM, textDecoration: "none", color: INK, fontSize: 14,
              fontWeight: 600,
            }}
          >
            Sjekk på nytt
          </Link>
          <Link
            href="/portal"
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${MUTED}66`,
              background: CREAM, textDecoration: "none", color: INK, fontSize: 14,
              fontWeight: 600,
            }}
          >
            Dashbord
          </Link>
        </div>
      </header>

      <section style={{ padding: "28px 24px", maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span
            aria-hidden
            style={{
              width: 13, height: 13, borderRadius: "50%",
              background: STYLE[overall].dot, flexShrink: 0,
            }}
          />
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "-0.02em" }}>
            {HEADLINE[overall]}
          </h1>
        </div>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 22px 25px" }}>
          Sjekket {checkedAt} · alle tjenester pinget direkte, ingen bufring
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {results.map((r) => {
            const s = STYLE[r.state];
            return (
              <li
                key={r.id}
                style={{
                  background: "#fff", border: `1px solid ${MUTED}44`, borderRadius: 12,
                  padding: "14px 16px", display: "flex", gap: 13, alignItems: "flex-start",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 11, height: 11, borderRadius: "50%", background: s.dot,
                    flexShrink: 0, marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15.5 }}>{r.name}</strong>
                    <span style={{ fontSize: 13, color: s.text, fontWeight: 600 }}>{s.label}</span>
                    {r.latencyMs !== null && (
                      <span style={{ fontSize: 12.5, color: MUTED }}>{r.latencyMs} ms</span>
                    )}
                  </div>
                  {r.detail && (
                    <div style={{ fontSize: 13, color: s.text, marginTop: 3 }}>{r.detail}</div>
                  )}
                  {/* Only shown when it matters — a green row doesn't need to
                      explain what would break if it weren't green. */}
                  {r.state !== "ok" && (
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                      {r.impact}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p style={{ color: MUTED, fontSize: 12.5, marginTop: 20, lineHeight: 1.55 }}>
          «Ikke satt opp» betyr at nøkkelen mangler i miljøvariablene — det fikser
          du selv i Vercel. «Nede» betyr at tjenesten svarte feil, eller avviste
          nøkkelen vår.
        </p>
      </section>
    </main>
  );
}
