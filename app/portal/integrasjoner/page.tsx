import Link from "next/link";
import { getClients, getProfile } from "@/lib/portal/data";
import { loadSettings } from "@/lib/settings";
import { calendarConfigured } from "@/lib/calendar/provider";
import GoogleCalendarConnect from "../GoogleCalendarConnect";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const MUTED = "#9a9a8c";
const GREEN = "#15c07c";

/**
 * Admin-only integrations page — the future home of every external system a
 * client connects to. One card per integration, per client (?client=<id>).
 *
 * Today: Google Calendar (live, same flow as the dashboard modal — shared
 * component) and Outlook (announced but not built; the calendar-provider
 * seam in lib/calendar/provider.ts is where it will plug in).
 *
 * Admin-only for the same reason as onboarding: connecting a calendar is a
 * setup task done FOR the client, and the flow exposes service-account
 * details a client user has no use for.
 */
export default async function IntegrasjonerPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return (
      <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: 40 }}>
        <h1 style={{ fontSize: 22 }}>Ingen tilgang</h1>
        <p style={{ color: MUTED, maxWidth: 460, lineHeight: 1.55 }}>
          Integrasjoner er forbeholdt administratorer.
        </p>
        <Link href="/portal" style={{ color: INK, fontSize: 14 }}>
          Tilbake til dashbordet
        </Link>
      </main>
    );
  }

  const clients = await getClients();
  const { client: selected } = await searchParams;
  const activeClientId = selected ?? clients[0]?.id;
  const activeClient = clients.find((c) => c.id === activeClientId);

  if (!activeClientId) {
    return (
      <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: 40 }}>
        <h1 style={{ fontSize: 22 }}>Ingen kunder ennå</h1>
        <p style={{ color: MUTED }}>Opprett en kunde via onboarding først.</p>
      </main>
    );
  }

  const settings = await loadSettings(activeClientId);
  const googleConnected = calendarConfigured(settings);

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
        <span style={{ color: MUTED, fontSize: 14 }}>Integrasjoner</span>

        <form method="GET" style={{ marginLeft: 8 }}>
          <select
            name="client"
            defaultValue={activeClientId}
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

        <div style={{ marginLeft: "auto" }}>
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
        <h1 style={{ fontSize: 24, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Integrasjoner — {activeClient?.name}
        </h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 22px" }}>
          Systemene denne kundens agenter leser fra og booker i.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          {/* Google Calendar — live */}
          <section
            style={{
              background: "#fff", border: `1px solid ${MUTED}44`, borderRadius: 12,
              padding: "20px 22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span
                aria-hidden
                style={{
                  width: 11, height: 11, borderRadius: "50%",
                  background: googleConnected ? GREEN : MUTED, flexShrink: 0,
                }}
              />
              <h2 style={{ fontSize: 17, margin: 0 }}>📅 Google Calendar</h2>
              <span style={{ fontSize: 13, color: googleConnected ? "#0d6b47" : MUTED, fontWeight: 600 }}>
                {googleConnected ? "Tilkoblet" : "Ikke tilkoblet"}
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 6px", lineHeight: 1.5 }}>
              Agentene leser ledige timer fra og booker rett i kundens kalender.
            </p>
            <GoogleCalendarConnect clientId={activeClientId} />
          </section>

          {/* Outlook — announced, not built. The provider seam is ready. */}
          <section
            style={{
              background: "#fff", border: `1px dashed ${MUTED}66`, borderRadius: 12,
              padding: "20px 22px", opacity: 0.75,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span aria-hidden style={{ width: 11, height: 11, borderRadius: "50%", background: MUTED, flexShrink: 0 }} />
              <h2 style={{ fontSize: 17, margin: 0 }}>📆 Outlook Calendar</h2>
              <span
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#8a6d1f",
                  background: "#f6ecc9", padding: "3px 8px", borderRadius: 5,
                }}
              >
                KOMMER
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: 0, lineHeight: 1.5 }}>
              Booking rett i Microsoft 365-kalendere via Microsoft Graph. Aktiveres når første
              kunde trenger det — si fra, så settes Entra-appen opp.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
