import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Personvernerklæring",
  description:
    "Hvordan KI Consult behandler personopplysninger: hva vi samler inn, hvorfor, hvor lenge - og hvilke rettigheter du har.",
  alternates: { canonical: "/personvern" },
};

// Static legal page in the 1A visual system. The processing described here is
// drawn from what the codebase actually does (demo-skjema, tale-demo,
// samtaleopptak for kunders linjer, chat) — keep it in sync when the product
// changes what it collects.

const INK = "#16190F";
const BODY = "#4A4736";
const MUTED = "#6E6B5C";
const RULE = "#DCD6C6";
const GREEN = "#15A06A";
const mono = "var(--font-space-mono), monospace";

const sections: { title: string; body: string[] }[] = [
  {
    title: "Hvem vi er",
    body: [
      `KI Consult (${siteConfig.url}) leverer KI-resepsjonister for telefon, chat og web til norske bedrifter. KI Consult er behandlingsansvarlig for opplysninger du gir oss via nettsiden, og databehandler for opplysninger som behandles på vegne av bedriftskundene våre - for eksempel når du ringer en bedrift som bruker vår telefonagent.`,
      `Kontakt: ${siteConfig.email} · ${siteConfig.phone} · ${siteConfig.locality}, Norge.`,
    ],
  },
  {
    title: "Hva vi samler inn - og hvorfor",
    body: [
      "Demo-bestilling: bedriftsnavn, telefonnummer og ønsket tidspunkt, brukt til å kontakte deg om demoen du selv har bedt om (avtaleforberedelse, GDPR art. 6(1)(b)).",
      "Tale- og chat-demo på nettsiden: lyden og meldingene i samtalen behandles i sanntid for å svare deg. Demo-samtaler brukes også til å kvalitetssikre tjenesten.",
      "Telefonsamtaler til bedrifter som bruker vår agent: samtalen besvares av en KI-agent og kan bli tatt opp for kvalitetssikring på vegne av bedriften du ringer. Bedriften er behandlingsansvarlig; vi er databehandler.",
      "Teknisk drift: vanlige tjenerlogger (IP-adresse, tidspunkt, forespørsel) for sikkerhet og feilsøking (berettiget interesse, art. 6(1)(f)).",
    ],
  },
  {
    title: "Underleverandører",
    body: [
      "Vi bruker anerkjente underleverandører med databehandleravtaler: Vercel (drift og lagring), Supabase (database), OpenAI (taleteknologi), Anthropic (chatteknologi), Telnyx (telefoni) og Resend (e-postbekreftelser). Enkelte av disse behandler data i EU/EØS og USA under EU-U.S. Data Privacy Framework eller standard personvernbestemmelser (SCC).",
    ],
  },
  {
    title: "Lagringstid",
    body: [
      "Demo-henvendelser slettes når dialogen er avsluttet og senest etter 12 måneder. Samtaleopptak lagres så lenge kvalitetssikringen krever det og slettes deretter. Tekniske logger roteres fortløpende.",
    ],
  },
  {
    title: "Dine rettigheter",
    body: [
      "Du har rett til innsyn, retting, sletting, begrensning og dataportabilitet, og til å protestere mot behandling basert på berettiget interesse. Gjelder henvendelsen en samtale med en av våre bedriftskunder, hjelper vi deg videre til riktig behandlingsansvarlig.",
      `Ta kontakt på ${siteConfig.email}, så svarer vi uten ugrunnet opphold. Du kan også klage til Datatilsynet (datatilsynet.no).`,
    ],
  },
  {
    title: "Informasjonskapsler",
    body: [
      "Nettsiden bruker kun teknisk nødvendige informasjonskapsler (innlogging for kunder). Vi bruker ikke tredjeparts sporings- eller annonsekapsler.",
    ],
  },
];

export default function PersonvernPage() {
  return (
    <main style={{ color: INK }}>
      <header style={{ borderBottom: `1px solid ${RULE}` }}>
        <div
          style={{
            maxWidth: 1140,
            margin: "0 auto",
            padding: "18px 48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", textDecoration: "none" }}>
            KI&nbsp;Consult<span style={{ color: GREEN }}>.no</span>
          </Link>
          <Link href="/" className="nav-link" style={{ fontSize: 14.5, fontWeight: 500, color: BODY, textDecoration: "none" }}>
            ← Til forsiden
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "72px 48px 96px" }}>
        <div className="sec-head">
          <div className="sec-label">Personvern</div>
          <div style={{ maxWidth: "70ch" }}>
            <h1 style={{ fontSize: "clamp(32px,4vw,46px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 700, margin: 0 }}>
              Personvernerklæring
            </h1>
            <p style={{ fontFamily: mono, fontSize: 12, color: MUTED, margin: "18px 0 0" }}>
              Sist oppdatert: 28. juli 2026
            </p>

            {sections.map((s) => (
              <section key={s.title} style={{ marginTop: 40, borderTop: `1px solid ${RULE}`, paddingTop: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
                  {s.title}
                </h2>
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)} style={{ fontSize: 16.5, lineHeight: 1.7, color: BODY, margin: "0 0 14px" }}>
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
