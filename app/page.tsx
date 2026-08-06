import type { CSSProperties } from "react";
import Link from "next/link";
import VoiceDemo from "@/components/VoiceDemo";
import BookingForm from "@/components/BookingForm";
import IntegrationsOrbit from "@/components/IntegrationsOrbit";
import { gDays, steps, features, industries, faqs, pricingPlans } from "@/lib/content";
import { siteConfig } from "@/lib/site";

// Landing page in the 1A «Nordisk institusjonell» treatment (claude.ai/design
// project "Website redesign direction"). Same content, same flow, same
// functionality as before — BookingForm still posts /api/send-booking,
// VoiceDemo is the real WebRTC agent, all section ids are unchanged so old
// anchors and blog deep-links keep working. Only the visual system changed:
// numbered mono section labels, hairline grids, 4px corners, cream on ink.

/** Parse "2 500 kr" -> 2500 for schema Offer prices. */
function priceValue(s?: string): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/icon.png`,
    email: siteConfig.email,
    telephone: siteConfig.phone,
    description: siteConfig.description,
    address: {
      "@type": "PostalAddress",
      addressLocality: siteConfig.locality,
      addressCountry: siteConfig.country,
    },
    areaServed: { "@type": "Country", name: "Norge" },
    knowsAbout: [
      "KI-resepsjonist",
      "AI-resepsjonist",
      "virtuell resepsjonist",
      "AI-kundeservice",
      "AI-telefoni",
      "AI-sentralbord",
      "norsk taleteknologi",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: "nb-NO",
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "KI-resepsjonist og AI-kundeservice",
    name: "KI-resepsjonist for telefon, chat og web",
    alternateName: [
      "AI-resepsjonist",
      "Virtuell resepsjonist",
      "AI-sentralbord",
      "AI-kundeservice",
    ],
    description: siteConfig.description,
    provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    areaServed: { "@type": "Country", name: "Norge" },
    offers: pricingPlans
      .map((plan) => {
        const price = priceValue(plan.monthly);
        if (price == null) return null;
        return {
          "@type": "Offer",
          name: plan.name,
          price,
          priceCurrency: "NOK",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price,
            priceCurrency: "NOK",
            unitText: "MND",
          },
          url: `${siteConfig.url}/#priser`,
        };
      })
      .filter(Boolean),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  },
];

const mono = "var(--font-space-mono), monospace";

/* Shared 1A tokens */
const INK = "#16190F";
const DEEP = "#0B2118";
const CREAM = "#F5F2E9";
const BAND = "#EEEADD";
const RULE = "#DCD6C6"; // hairline on cream
const RULE_BAND = "#D3CCB9"; // hairline on band / inside grids
const BODY = "#4A4736";
const MUTED = "#6E6B5C";
const GREEN = "#15A06A";
const RUST = "#C2562C";

const inner: CSSProperties = { maxWidth: 1140, margin: "0 auto", padding: "0 48px" };

function Hairline() {
  return (
    <div className="section-inner" style={inner}>
      <div style={{ height: 1, background: RULE }} />
    </div>
  );
}

export default function Home() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* NAV */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "rgba(245,242,233,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        <div
          className="section-inner"
          style={{
            ...inner,
            padding: "18px 48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em" }}>
            KI&nbsp;Consult<span style={{ color: GREEN }}>.no</span>
          </div>
          <nav
            className="nav-links"
            style={{
              display: "flex",
              gap: 28,
              alignItems: "center",
              fontSize: 14.5,
              fontWeight: 500,
              color: BODY,
            }}
          >
            <a href="#funksjoner" className="nav-link" style={{ textDecoration: "none" }}>
              Funksjoner
            </a>
            <a href="#bransjer" className="nav-link" style={{ textDecoration: "none" }}>
              Bransjer
            </a>
            <a href="#slik" className="nav-link" style={{ textDecoration: "none" }}>
              Slik funker det
            </a>
            <a href="#priser" className="nav-link" style={{ textDecoration: "none" }}>
              Priser
            </a>
            <Link href="/blog" className="nav-link" style={{ textDecoration: "none" }}>
              Blogg
            </Link>
          </nav>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Link
              href="/login"
              className="nav-link"
              style={{ textDecoration: "none", fontSize: 14.5, fontWeight: 500, color: BODY }}
            >
              Logg inn
            </Link>
            <a
              href="#demo"
              className="btn-ink nav-cta"
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                padding: "10px 18px",
                borderRadius: 4,
                textDecoration: "none",
              }}
            >
              Snakk med AI-agenten
            </a>
          </div>
        </div>
      </header>

      {/* HERO — light, editorial */}
      <section>
        <div
          className="hero-grid"
          style={{
            ...inner,
            padding: "76px 48px 0",
            display: "grid",
            gridTemplateColumns: "1.12fr 0.88fr",
            gap: 64,
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: GREEN,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                className="live-dot"
                style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }}
              />
              Norskutviklet KI-resepsjonist
            </div>
            <h1
              style={{
                fontSize: "clamp(42px,5.6vw,74px)",
                lineHeight: 0.98,
                letterSpacing: "-0.04em",
                fontWeight: 700,
                margin: "26px 0 0",
                maxWidth: "13ch",
                textWrap: "balance",
              }}
            >
              Konkurrenten svarer ikke 24/7. Det gjør du.
            </h1>
            <div style={{ width: 64, height: 1, background: GREEN, margin: "32px 0" }} />
            <p
              className="hero-sub"
              style={{ fontSize: 19, lineHeight: 1.6, color: BODY, margin: 0, maxWidth: "44ch" }}
            >
              KI-resepsjonisten som tar telefonen, chatten og webhenvendelsene dine automatisk.
              {" "}{gDays} dagers pengene-tilbake-garanti.
            </p>
            <div style={{ display: "flex", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
              <a
                href="#demo"
                className="btn-ink"
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  padding: "17px 28px",
                  borderRadius: 4,
                  textDecoration: "none",
                }}
              >
                Snakk med AI-agenten →
              </a>
              <a
                href="#book"
                className="btn-line"
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  padding: "17px 26px",
                  borderRadius: 4,
                  textDecoration: "none",
                }}
              >
                Book et møte →
              </a>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 26,
                fontSize: 14.5,
                color: MUTED,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: GREEN }}>✓</span> Gratis å komme i gang
              <span style={{ opacity: 0.4 }}>·</span> Ingen binding
              <span style={{ opacity: 0.4 }}>·</span>{" "}
              <strong style={{ color: "#2E2C20", fontWeight: 600 }}>
                {gDays} dagers medlemskaps garanti
              </strong>
            </div>
          </div>

          {/* Booking card */}
          <div
            id="book"
            style={{
              background: "#FFFFFF",
              border: `1px solid ${RULE}`,
              borderRadius: 6,
              padding: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                color: GREEN,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#15C07C" }} />
              Live demo
            </div>
            <h3 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em", margin: "14px 0 6px" }}>
              Få en gratis live-demo
            </h3>
            <p style={{ fontSize: 15, color: MUTED, margin: "0 0 24px", lineHeight: 1.5 }}>
              20 minutter - vi viser plattformen live med din egen case.
            </p>
            <div style={{ height: 1, background: "#E8E2D2", margin: "0 0 22px" }} />
            <BookingForm />
          </div>
        </div>

        <div style={{ ...inner, marginTop: 88 }}>
          <div style={{ height: 1, background: RULE }} />
        </div>
      </section>

      {/* 01 / LIVE DEMO */}
      <section id="demo" className="section-pad" style={{ padding: "72px 0" }}>
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">01 / Live demo</div>
            <div>
              <h2 className="sec-h2" style={{ maxWidth: "20ch" }}>
                Snakk med en norsk AI-agent - akkurat nå.
              </h2>
              <p style={{ fontSize: 17.5, color: BODY, margin: "20px 0 0", maxWidth: "56ch", lineHeight: 1.6 }}>
                Gi agenten din egen instruksjon, trykk på knappen og snakk med den i sanntid.
                Naturlig norsk stemme - rett i nettleseren.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 44, background: DEEP, borderRadius: 6, padding: 40 }}>
            <VoiceDemo />
          </div>
        </div>
      </section>

      <Hairline />

      {/* 02 / KOSTNADEN */}
      <section className="section-pad" style={{ padding: "72px 0" }}>
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label" style={{ color: RUST }}>02 / Kostnaden ved å ikke svare</div>
            <h2 className="sec-h2" style={{ maxWidth: "22ch" }}>
              Hver ubesvart henvendelse er en kunde på vei til konkurrenten.
            </h2>
          </div>
          <div
            className="stats-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              marginTop: 56,
              borderTop: `1px solid ${RULE}`,
            }}
          >
            {[
              { v: "6 av 10", c: RUST, d: "ringer aldri tilbake hvis de ikke når deg første gang. De ringer nestemann." },
              { v: "< 5 min", c: RUST, d: "er det kundene forventer å vente på svar. Etter det faller konverteringen bratt." },
              { v: "0 kr", c: DEEP, d: "i lønn, 100 % oppmøte, null sykefravær. Agenten din sover aldri." },
            ].map((s, i) => (
              <div
                key={s.v}
                className="stats-cell"
                style={{
                  padding: i === 0 ? "36px 36px 36px 0" : i === 2 ? "36px 0 36px 36px" : 36,
                  borderRight: i < 2 ? `1px solid ${RULE}` : undefined,
                  borderBottom: `1px solid ${RULE}`,
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(40px,4.6vw,60px)",
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                    color: s.c,
                    lineHeight: 1,
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {s.v}
                </div>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: BODY, margin: "18px 0 0" }}>{s.d}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: mono, fontSize: 12, color: "#8A8B7C", marginTop: 24 }}>
            Tall er illustrative og bransjeavhengige.
          </p>
        </div>
      </section>

      <Hairline />

      {/* 03 / SLIK FUNKER DET */}
      <section id="slik" className="section-pad" style={{ padding: "72px 0" }}>
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">03 / Slik funker det</div>
            <h2 className="sec-h2" style={{ maxWidth: "18ch" }}>
              Live på 7 dager. Null kodekunnskap.
            </h2>
          </div>
          <div style={{ marginTop: 52, display: "flex", flexDirection: "column" }}>
            {steps.map((s) => (
              <div
                key={s.n}
                className="steps-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 320px 1fr",
                  gap: 32,
                  alignItems: "baseline",
                  padding: "32px 0",
                  borderTop: `1px solid ${RULE}`,
                }}
              >
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 34,
                    fontWeight: 700,
                    color: "#C7C0AC",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {s.n}
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", margin: 0 }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 16.5, lineHeight: 1.6, color: BODY, margin: 0, maxWidth: "52ch" }}>
                  {s.desc}
                </p>
              </div>
            ))}
            <div style={{ height: 1, background: RULE }} />
          </div>
        </div>
      </section>

      {/* 04 / FUNKSJONER — band */}
      <section
        id="funksjoner"
        className="section-pad"
        style={{ background: BAND, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "72px 0" }}
      >
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">04 / Funksjoner</div>
            <h2 className="sec-h2" style={{ maxWidth: "22ch" }}>
              Én plattform for telefon, chat og web.
            </h2>
          </div>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              marginTop: 56,
              borderTop: `1px solid ${RULE_BAND}`,
              borderLeft: `1px solid ${RULE_BAND}`,
            }}
          >
            {features.map((f) => (
              <div
                key={f.title}
                style={{
                  padding: 32,
                  borderRight: `1px solid ${RULE_BAND}`,
                  borderBottom: `1px solid ${RULE_BAND}`,
                }}
              >
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: GREEN, letterSpacing: "0.06em" }}>
                  {f.n}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: "18px 0 10px" }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 15.5, lineHeight: 1.6, color: BODY, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 / INTEGRASJONER */}
      <section className="section-pad" style={{ padding: "72px 0" }}>
        <div
          className="integ-grid section-inner"
          style={{
            ...inner,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div>
            <div className="sec-label" style={{ paddingTop: 0 }}>05 / Integrasjoner</div>
            <h2 className="sec-h2" style={{ margin: "22px 0 0", maxWidth: "16ch" }}>
              Kobles rett på systemene dere bruker.
            </h2>
            <p style={{ fontSize: 17, color: BODY, margin: "22px 0 0", maxWidth: "46ch", lineHeight: 1.65 }}>
              Dere trenger ikke bytte ut programvare for å komme i gang. Agenten jobber direkte i
              verktøyene dere allerede har - henter data og utfører oppgaver automatisk.
            </p>
            <div style={{ display: "flex", flexDirection: "column", margin: "32px 0 34px", borderTop: `1px solid ${RULE}` }}>
              {[
                "Full støtte for autentisering med BankID",
                "Snakker med alle deres fagsystemer",
                "Ingen utskifting av eksisterende systemer",
              ].map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 0",
                    borderBottom: `1px solid ${RULE}`,
                  }}
                >
                  <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 16.5, fontWeight: 600, color: INK }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a
                href="#book"
                className="btn-ink"
                style={{ fontWeight: 600, fontSize: 16, padding: "15px 26px", borderRadius: 4, textDecoration: "none" }}
              >
                Få en demo →
              </a>
              <a
                href="#demo"
                className="btn-line"
                style={{ fontWeight: 600, fontSize: 16, padding: "15px 24px", borderRadius: 4, textDecoration: "none" }}
              >
                Snakk med agenten
              </a>
            </div>
          </div>
          <IntegrationsOrbit />
        </div>
      </section>

      {/* 06 / BRANSJER — band */}
      <section
        id="bransjer"
        className="section-pad"
        style={{ background: BAND, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "72px 0" }}
      >
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">06 / Bransjer</div>
            <h2 className="sec-h2" style={{ maxWidth: "22ch" }}>
              Skreddersydd for din bransje.
            </h2>
          </div>
          <div
            className="grid-4"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              marginTop: 56,
              borderTop: `1px solid ${RULE_BAND}`,
              borderLeft: `1px solid ${RULE_BAND}`,
            }}
          >
            {industries.map((it) => (
              <div
                key={it.title}
                style={{
                  padding: 26,
                  borderRight: `1px solid ${RULE_BAND}`,
                  borderBottom: `1px solid ${RULE_BAND}`,
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", margin: "0 0 9px" }}>
                  {it.title}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5A5749", margin: 0 }}>{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 07 / PRISER */}
      <section id="priser" className="section-pad" style={{ padding: "72px 0" }}>
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">07 / Priser</div>
            <div>
              <h2 className="sec-h2" style={{ maxWidth: "20ch" }}>
                Tydelig pris. Ingen skjulte kostnader.
              </h2>
              <p style={{ fontSize: 17, color: BODY, margin: "20px 0 0", maxWidth: "58ch", lineHeight: 1.6 }}>
                Chat er alltid gratis - du betaler kun for taleminutter. Overforbruk faktureres til
                6 kr/min. Ingen binding, {gDays} dagers pengene-tilbake.
              </p>
            </div>
          </div>
          <div
            className="plans-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              marginTop: 56,
              border: `1px solid ${RULE_BAND}`,
              borderRadius: 6,
              overflow: "hidden",
              background: "#FFFFFF",
            }}
          >
            {pricingPlans.map((p, i) => {
              const featured = Boolean(p.featured);
              const fg = featured ? CREAM : INK;
              const muted = featured ? "#A9BBAF" : MUTED;
              const featFg = featured ? "#C9D6CE" : BODY;
              const rule = featured ? "rgba(255,255,255,0.12)" : "#E8E2D2";
              return (
                <div
                  key={p.name}
                  className="plans-col"
                  style={{
                    padding: "32px 28px",
                    display: "flex",
                    flexDirection: "column",
                    borderRight: i < pricingPlans.length - 1 ? `1px solid ${RULE_BAND}` : undefined,
                    background: featured ? DEEP : "#FFFFFF",
                    color: fg,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      minHeight: 24,
                    }}
                  >
                    <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
                      {p.name}
                    </h3>
                    {p.badge && (
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: "#3FE0A0",
                          border: "1px solid rgba(63,224,160,0.5)",
                          padding: "4px 8px",
                          borderRadius: 3,
                        }}
                      >
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 400, margin: "10px 0 26px", color: muted }}>
                    {p.minutes}
                  </div>
                  {p.monthly ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.035em", fontFeatureSettings: "'tnum'" }}>
                          {p.monthly}
                        </span>
                        <span style={{ fontSize: 14, color: muted }}>/mnd</span>
                      </div>
                      <div style={{ fontSize: 13.5, margin: "8px 0 26px", color: muted }}>
                        + {p.setup} oppsett (engangs)
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 26px", color: muted, minHeight: 73 }}>
                      Kontakt oss for pris
                    </div>
                  )}
                  <a
                    href="#book"
                    className={featured ? "btn-cta" : "btn-ink"}
                    style={{
                      display: "block",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: 15,
                      padding: 14,
                      borderRadius: 4,
                      marginBottom: 26,
                      textDecoration: "none",
                    }}
                  >
                    {p.cta} →
                  </a>
                  <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${rule}` }}>
                    {p.features.map((feat) => (
                      <div
                        key={feat}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 14,
                          lineHeight: 1.5,
                          padding: "12px 0",
                          borderBottom: `1px solid ${rule}`,
                        }}
                      >
                        <span style={{ color: featured ? "#3FE0A0" : GREEN, fontSize: 12, marginTop: 3 }}>✓</span>
                        <span style={{ color: featFg }}>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Hairline />

      {/* 08 / KI-RESEPSJONIST FORKLART */}
      <section id="ki-resepsjonist" className="section-pad" style={{ padding: "72px 0" }}>
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">08 / KI-resepsjonist forklart</div>
            <div style={{ maxWidth: "70ch" }}>
              <h2 className="sec-h2" style={{ fontSize: "clamp(30px,3.6vw,42px)", lineHeight: 1.12, margin: "0 0 28px" }}>
                Hva er en KI-resepsjonist?
              </h2>
              <p style={{ fontSize: 17.5, lineHeight: 1.75, color: "#3E3B2E", margin: "0 0 20px" }}>
                En KI-resepsjonist (også kalt AI-resepsjonist eller virtuell resepsjonist) er en
                digital medarbeider som bruker kunstig intelligens til å svare på telefon, chat og
                webhenvendelser - på naturlig norsk, døgnet rundt. Den tar imot samtaler, booker og
                endrer timer, svarer på vanlige spørsmål og setter over til en ansatt når det faktisk
                trengs et menneske.
              </p>
              <p style={{ fontSize: 17.5, lineHeight: 1.75, color: "#3E3B2E", margin: "0 0 20px" }}>
                I motsetning til et tradisjonelt sentralbord eller en telefonsvarer, forstår
                KI-resepsjonisten hva kunden faktisk spør om og løser saken der og da. KI Consult sin
                KI-resepsjonist er norskutviklet, svarer med naturlig norsk stemme på under 300
                millisekunder, støtter BankID- og Vipps-identifisering, og all data hostes i Norge i
                tråd med GDPR.
              </p>
              <p style={{ fontSize: 17.5, lineHeight: 1.75, color: "#3E3B2E", margin: 0 }}>
                Typiske brukere er tannleger, klinikker, verksteder, eiendomsmeglere og andre
                bedrifter som taper kunder på ubesvarte anrop. Oppsettet tar 7 dager, krever ingen
                utvikler, og agenten kan{" "}
                <a
                  href="#demo"
                  style={{ color: GREEN, fontWeight: 600, borderBottom: `1px solid ${GREEN}`, textDecoration: "none" }}
                >
                  prøves gratis i nettleseren
                </a>{" "}
                før du bestemmer deg.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 09 / FAQ — band */}
      <section
        id="faq"
        className="section-pad"
        style={{ background: BAND, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "72px 0" }}
      >
        <div className="section-inner" style={inner}>
          <div className="sec-head">
            <div className="sec-label">09 / Vanlige spørsmål</div>
            <div style={{ width: "100%" }}>
              <h2 className="sec-h2" style={{ fontSize: "clamp(30px,3.6vw,42px)", lineHeight: 1.12, margin: "0 0 36px" }}>
                Alt du lurer på.
              </h2>
              <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${RULE_BAND}` }}>
                {faqs.map((item) => (
                  <div
                    key={item.q}
                    className="faq-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1.25fr",
                      gap: 40,
                      padding: "26px 0",
                      borderBottom: `1px solid ${RULE_BAND}`,
                    }}
                  >
                    <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em", margin: 0, lineHeight: 1.4 }}>
                      {item.q}
                    </h3>
                    <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BODY, margin: 0 }}>{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA — dark band */}
      <section style={{ background: DEEP, color: CREAM, padding: "112px 48px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontSize: "clamp(36px,5vw,56px)",
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              fontWeight: 700,
              margin: 0,
              textWrap: "balance",
            }}
          >
            Konkurrenten svarer ikke 24/7. Det gjør du.
          </h2>
          <div style={{ width: 64, height: 1, background: "#3FE0A0", margin: "36px auto" }} />
          <p style={{ fontSize: 19, lineHeight: 1.6, color: "#A9BBAF", margin: "0 auto", maxWidth: "50ch" }}>
            Kom i gang gratis i dag. Live på 7 dager, ingen binding, og {gDays} dagers
            pengene-tilbake hvis du ikke er fornøyd.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 38, flexWrap: "wrap" }}>
            <a
              href="#demo"
              className="btn-cta"
              style={{ fontWeight: 700, fontSize: 17, padding: "18px 32px", borderRadius: 4, textDecoration: "none" }}
            >
              Snakk med AI-agenten →
            </a>
            <a
              href="#book"
              className="btn-line-dark"
              style={{ fontWeight: 600, fontSize: 17, padding: "18px 30px", borderRadius: 4, textDecoration: "none" }}
            >
              Book et møte →
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#08160F", color: "#93A79B", padding: "64px 0 36px" }}>
        <div
          className="footer-grid section-inner"
          style={{
            ...inner,
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr 1fr 1fr",
            gap: 40,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", color: CREAM }}>
              KI Consult<span style={{ color: "#3FE0A0" }}>.no</span>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: "16px 0 0", maxWidth: "34ch" }}>
              Norskutviklede AI-agenter for telefon, web og chat. Vi hjelper bedrifter med å aldri
              miste en kunde - døgnet rundt.
            </p>
          </div>
          <div>
            <div style={footerHeading}>Løsninger</div>
            <div style={footerCol}>
              <a href="#funksjoner" className="footer-link" style={footerLink}>AI-chatbot</a>
              <a href="#funksjoner" className="footer-link" style={footerLink}>AI-telefoni</a>
              <a href="#funksjoner" className="footer-link" style={footerLink}>Tale-widget</a>
              <a href="#funksjoner" className="footer-link" style={footerLink}>Integrasjoner</a>
            </div>
          </div>
          <div>
            <div style={footerHeading}>Selskap</div>
            <div style={footerCol}>
              <a href="#priser" className="footer-link" style={footerLink}>Priser</a>
              <a href="#bransjer" className="footer-link" style={footerLink}>Bransjer</a>
              <Link href="/blog" className="footer-link" style={footerLink}>Blogg</Link>
              <a href="#faq" className="footer-link" style={footerLink}>FAQ</a>
            </div>
          </div>
          <div>
            <div style={footerHeading}>Kontakt</div>
            <div style={footerCol}>
              <span>{siteConfig.phone}</span>
              <span>{siteConfig.email}</span>
              <span>{siteConfig.locality}, Norge</span>
            </div>
          </div>
        </div>
        <div
          className="section-inner"
          style={{
            ...inner,
            marginTop: 44,
            paddingTop: 22,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 13,
            color: "#66786D",
          }}
        >
          <span>© 2026 KI Consult AS</span>
          <span style={{ display: "flex", gap: 20 }}>
            <a href="#" className="footer-link" style={footerLink}>Vilkår</a>
            <Link href="/personvern" className="footer-link" style={footerLink}>Personvern</Link>
            <Link href="/portal/status" className="footer-link" style={footerLink}>Systemstatus</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

const footerHeading: CSSProperties = {
  fontFamily: mono,
  color: CREAM,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  marginBottom: 16,
};

const footerCol: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 11,
  fontSize: 14.5,
};

const footerLink: CSSProperties = {
  textDecoration: "none",
};
