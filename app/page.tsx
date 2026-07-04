import type { CSSProperties } from "react";
import VoiceDemo from "@/components/VoiceDemo";
import BookingForm from "@/components/BookingForm";
import IntegrationsOrbit from "@/components/IntegrationsOrbit";
import { gDays, steps, features, industries, faqs, pricingPlans } from "@/lib/content";
import { siteConfig } from "@/lib/site";

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
          background: "rgba(243,239,228,0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid #E3DDCC",
        }}
      >
        <div
          className="section-inner"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "15px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-0.03em" }}>
            KI&nbsp;Consult<span style={{ color: "#15A06A" }}>.no</span>
          </div>
          <nav
            className="nav-links"
            style={{
              display: "flex",
              gap: 30,
              alignItems: "center",
              fontSize: 15,
              fontWeight: 500,
              color: "#3A3D31",
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
          </nav>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a
              href="#demo"
              className="btn-primary nav-cta"
              style={{
                color: "#08231A",
                fontWeight: 700,
                fontSize: 15,
                padding: "11px 18px",
                borderRadius: 11,
                textDecoration: "none",
              }}
            >
              Snakk med AI-agenten
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          background: "#0B2118",
          backgroundImage:
            "radial-gradient(1100px 520px at 72% -8%, rgba(21,192,124,0.20), transparent 62%)",
          color: "#EFEDE2",
        }}
      >
        <div
          className="hero-grid"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "74px 32px 72px",
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: 56,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#3FE0A0",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#3FE0A0",
                  boxShadow: "0 0 0 4px rgba(63,224,160,0.18)",
                }}
              />
              Norskutviklet KI-resepsjonist
            </div>
            <h1
              style={{
                fontSize: "clamp(40px,5.4vw,72px)",
                lineHeight: 1.0,
                letterSpacing: "-0.035em",
                fontWeight: 800,
                margin: "20px 0 0",
                maxWidth: "15ch",
                textWrap: "balance",
              }}
            >
              Konkurrenten svarer ikke 24/7. Det gjør du.
            </h1>
            <p
              className="hero-sub"
              style={{
                fontSize: 19,
                lineHeight: 1.5,
                color: "#AFC0B5",
                margin: "24px 0 0",
                maxWidth: "48ch",
              }}
            >
              KI-resepsjonisten som tar telefonen, chatten og webhenvendelsene dine automatisk.
              30 dagers pengene-tilbake-garanti. Null risiko.
            </p>
            <div style={{ display: "flex", gap: 14, marginTop: 32, flexWrap: "wrap" }}>
              <a
                href="#demo"
                className="btn-primary"
                style={{
                  color: "#08231A",
                  fontWeight: 700,
                  fontSize: 17,
                  padding: "17px 28px",
                  borderRadius: 13,
                  textDecoration: "none",
                  boxShadow: "0 10px 30px rgba(21,192,124,0.3)",
                }}
              >
                Snakk med AI-agenten →
              </a>
              <a
                href="#book"
                className="btn-outline"
                style={{
                  background: "transparent",
                  color: "#EFEDE2",
                  fontWeight: 600,
                  fontSize: 17,
                  padding: "17px 26px",
                  borderRadius: 13,
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
                marginTop: 20,
                fontSize: 14.5,
                color: "#9FB3A7",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#3FE0A0" }}>✓</span> Gratis å komme i gang
              <span style={{ opacity: 0.4 }}>·</span> Ingen binding
              <span style={{ opacity: 0.4 }}>·</span>{" "}
              <strong style={{ color: "#D8E4DC", fontWeight: 600 }}>
                {gDays} dagers medlemskaps garanti
              </strong>
            </div>
          </div>

          {/* Demo card */}
          <div
            id="book"
            style={{
              background: "#FBFAF4",
              color: "#16190F",
              borderRadius: 20,
              padding: 30,
              boxShadow: "0 30px 70px rgba(0,0,0,0.34)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: "0.1em",
                color: "#15A06A",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: "50%", background: "#15C07C" }}
              />
              Live demo
            </div>
            <h3
              style={{
                fontSize: 25,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: "12px 0 4px",
              }}
            >
              Få en gratis live-demo
            </h3>
            <p style={{ fontSize: 15, color: "#5C5F52", margin: "0 0 18px", lineHeight: 1.45 }}>
              20 minutter - vi viser plattformen live med din egen case.
            </p>
            <BookingForm />
          </div>
        </div>

      </section>

      {/* LIVE VOICE DEMO */}
      <section id="demo" className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 40px" }}>
            <div style={{ ...eyebrowGreen, textAlign: "center" }}>Live demo</div>
            <h2
              style={{
                fontSize: "clamp(30px,3.8vw,50px)",
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                margin: "14px 0 0",
                textWrap: "balance",
              }}
            >
              Snakk med en norsk AI-agent - akkurat nå.
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "#4A4D40",
                margin: "16px auto 0",
                maxWidth: "52ch",
                lineHeight: 1.5,
              }}
            >
              Gi agenten din egen instruksjon, trykk på knappen og snakk med den i
              sanntid. Naturlig norsk stemme - rett i nettleseren.
            </p>
          </div>

          {/* Dark stage holding the interactive demo */}
          <div
            style={{
              background: "#0B2118",
              backgroundImage:
                "radial-gradient(900px 460px at 80% 0%, rgba(21,192,124,0.16), transparent 60%)",
              borderRadius: 24,
              padding: 28,
              boxShadow: "0 30px 70px rgba(11,33,24,0.28)",
            }}
          >
            <VoiceDemo />
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div
          className="section-inner"
          style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", textAlign: "center" }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#C2562C",
              fontWeight: 700,
            }}
          >
            Kostnaden ved å ikke svare
          </div>
          <h2
            style={{
              fontSize: "clamp(30px,3.8vw,50px)",
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "16px auto 0",
              maxWidth: "18ch",
              textWrap: "balance",
            }}
          >
            Hver ubesvart henvendelse er en kunde på vei til konkurrenten.
          </h2>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 18,
              marginTop: 48,
              textAlign: "left",
            }}
          >
            <div style={cardLight}>
              <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", color: "#C2562C" }}>
                6 av 10
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.45, color: "#4A4D40", margin: "10px 0 0" }}>
                ringer aldri tilbake hvis de ikke når deg første gang. De ringer nestemann.
              </p>
            </div>
            <div style={cardLight}>
              <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", color: "#C2562C" }}>
                &lt; 5 min
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.45, color: "#4A4D40", margin: "10px 0 0" }}>
                er det kundene forventer å vente på svar. Etter det faller konverteringen bratt.
              </p>
            </div>
            <div style={{ background: "#0B2118", borderRadius: 16, padding: 28, color: "#EFEDE2" }}>
              <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", color: "#3FE0A0" }}>
                0 kr
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.45, color: "#AFC0B5", margin: "10px 0 0" }}>
                i lønn, 100&nbsp;% oppmøte, null sykefravær. Agenten din sover aldri.
              </p>
            </div>
          </div>
          <p style={{ fontSize: 14, color: "#8A8B7C", marginTop: 18 }}>
            Tall er illustrative og bransjeavhengige.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="slik" className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
          <div style={eyebrowGreen}>Slik funker det</div>
          <h2
            style={{
              fontSize: "clamp(30px,3.8vw,50px)",
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "14px 0 0",
              maxWidth: "16ch",
              textWrap: "balance",
            }}
          >
            Live på 7 dager. Null kodekunnskap.
          </h2>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
              marginTop: 48,
            }}
          >
            {steps.map((item) => (
              <div key={item.n} style={{ ...cardLight, padding: 30 }}>
                <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: "#15A06A" }}>
                  {item.n}
                </div>
                <h3
                  style={{
                    fontSize: 21,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    margin: "14px 0 8px",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#4A4D40", margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="funksjoner" className="section-pad" style={{ background: "#EDE8DB", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px" }}>
          <div style={eyebrowGreen}>Funksjoner</div>
          <h2
            style={{
              fontSize: "clamp(30px,3.8vw,50px)",
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "14px 0 0",
              maxWidth: "20ch",
              textWrap: "balance",
            }}
          >
            Én plattform for telefon, chat og web.
          </h2>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 18,
              marginTop: 48,
            }}
          >
            {features.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#FBFAF4",
                  border: "1px solid #E2DCCB",
                  borderRadius: 16,
                  padding: 26,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: "#0B2118",
                    color: "#3FE0A0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: mono,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {item.n}
                </div>
                <h3
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    margin: "16px 0 7px",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D40", margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div
          className="integ-grid"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 32px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "center",
          }}
        >
          {/* Left: copy */}
          <div>
            <div style={eyebrowGreen}>Integrasjoner</div>
            <h2
              style={{
                fontSize: "clamp(30px,3.8vw,50px)",
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                margin: "14px 0 0",
                maxWidth: "16ch",
                textWrap: "balance",
              }}
            >
              Kobles rett på systemene dere bruker.
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "#4A4D40",
                margin: "18px 0 0",
                maxWidth: "46ch",
                lineHeight: 1.55,
              }}
            >
              Dere trenger ikke bytte ut programvare for å komme i gang. Agenten jobber
              direkte i verktøyene dere allerede har - henter data og utfører oppgaver
              automatisk.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "30px 0 32px" }}>
              {[
                "Full støtte for autentisering med BankID",
                "Snakker med alle deres fagsystemer",
                "Ingen utskifting av eksisterende systemer",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: "rgba(21,160,106,0.12)",
                      color: "#15A06A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: 16.5, fontWeight: 700, color: "#16190F" }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a
                href="#book"
                className="btn-primary"
                style={{
                  color: "#08231A",
                  fontWeight: 700,
                  fontSize: 16,
                  padding: "15px 26px",
                  borderRadius: 12,
                  textDecoration: "none",
                }}
              >
                Få en demo →
              </a>
              <a
                href="#demo"
                style={{
                  background: "transparent",
                  color: "#16190F",
                  fontWeight: 600,
                  fontSize: 16,
                  padding: "15px 24px",
                  borderRadius: 12,
                  textDecoration: "none",
                  border: "1px solid #C9C3B2",
                }}
              >
                Snakk med agenten
              </a>
            </div>
          </div>

          {/* Right: orbit */}
          <IntegrationsOrbit />
        </div>
      </section>

      {/* INDUSTRIES */}
      <section id="bransjer" className="section-pad" style={{ background: "#EDE8DB", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px" }}>
          <div style={eyebrowGreen}>Bransjer</div>
          <h2
            style={{
              fontSize: "clamp(30px,3.8vw,50px)",
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "14px 0 0",
              maxWidth: "20ch",
              textWrap: "balance",
            }}
          >
            Skreddersydd for din bransje.
          </h2>
          <div
            className="grid-4"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 16,
              marginTop: 48,
            }}
          >
            {industries.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#FBFAF4",
                  border: "1px solid #E2DCCB",
                  borderRadius: 14,
                  padding: 22,
                }}
              >
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    margin: "0 0 7px",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.45, color: "#5A5D50", margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="priser" className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
            <div style={{ ...eyebrowGreen, textAlign: "center" }}>Priser</div>
            <h2
              style={{
                fontSize: "clamp(30px,3.8vw,50px)",
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                margin: "14px 0 0",
                textWrap: "balance",
              }}
            >
              Tydelig pris. Ingen skjulte kostnader.
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "#4A4D40",
                margin: "16px auto 0",
                maxWidth: "52ch",
                lineHeight: 1.5,
              }}
            >
              Chat er alltid gratis - du betaler kun for taleminutter. Overforbruk
              faktureres til 5 kr/min. Ingen binding, {gDays} dagers pengene-tilbake.
            </p>
          </div>

          <div
            className="grid-4"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 18,
              marginTop: 48,
              alignItems: "start",
            }}
          >
            {pricingPlans.map((plan) => {
              const featured = plan.featured;
              return (
                <div
                  key={plan.name}
                  style={{
                    background: featured ? "#0B2118" : "#FBFAF4",
                    color: featured ? "#EFEDE2" : "#16190F",
                    border: featured ? "1px solid #15C07C" : "1px solid #E2DCCB",
                    borderRadius: 18,
                    padding: 28,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: featured ? "0 24px 60px rgba(11,33,24,0.30)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 26 }}>
                    <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                      {plan.name}
                    </h3>
                    {plan.badge && (
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 10.5,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: "#08231A",
                          background: "#3FE0A0",
                          padding: "5px 9px",
                          borderRadius: 999,
                        }}
                      >
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 13,
                      color: featured ? "#9FD9C2" : "#15A06A",
                      fontWeight: 600,
                      margin: "6px 0 18px",
                    }}
                  >
                    {plan.minutes}
                  </div>

                  {plan.monthly ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        {plan.monthlyPrefix && (
                          <span style={{ fontSize: 16, fontWeight: 600, color: featured ? "#9FB3A7" : "#5C5F52" }}>
                            {plan.monthlyPrefix}
                          </span>
                        )}
                        <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em" }}>
                          {plan.monthly}
                        </span>
                        <span style={{ fontSize: 15, color: featured ? "#9FB3A7" : "#5C5F52" }}>/mnd</span>
                      </div>
                      <div style={{ fontSize: 14, color: featured ? "#9FB3A7" : "#5C5F52", margin: "6px 0 20px" }}>
                        + {plan.setup} oppsett (engangs)
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 700, color: featured ? "#9FD9C2" : "#15A06A", margin: "6px 0 20px" }}>
                      Kontakt oss for pris
                    </div>
                  )}

                  <a
                    href="#book"
                    className={featured ? "btn-primary" : undefined}
                    style={{
                      display: "block",
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 15,
                      padding: 14,
                      borderRadius: 12,
                      textDecoration: "none",
                      marginBottom: 22,
                      color: featured ? "#08231A" : "#F3EFE4",
                      background: featured ? undefined : "#0B2118",
                      border: featured ? "none" : "1px solid #0B2118",
                    }}
                  >
                    {plan.cta} →
                  </a>

                  <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {plan.features.map((feat) => (
                      <div
                        key={feat}
                        style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 14.5, lineHeight: 1.4 }}
                      >
                        <span style={{ color: "#3FE0A0", fontSize: 13, marginTop: 1 }}>✓</span>
                        <span style={{ color: featured ? "#C9D6CE" : "#4A4D40" }}>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* WHAT IS A KI-RESEPSJONIST (SEO / answer-engine content) */}
      <section id="ki-resepsjonist" className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 820, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ ...eyebrowGreen }}>KI-resepsjonist forklart</div>
          <h2
            style={{
              fontSize: "clamp(28px,3.6vw,44px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "14px 0 20px",
              textWrap: "balance",
            }}
          >
            Hva er en KI-resepsjonist?
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: "#4A4D40", margin: "0 0 18px" }}>
            En KI-resepsjonist (også kalt AI-resepsjonist eller virtuell resepsjonist) er en
            digital medarbeider som bruker kunstig intelligens til å svare på telefon, chat og
            webhenvendelser - på naturlig norsk, døgnet rundt. Den tar imot samtaler, booker og
            endrer timer, svarer på vanlige spørsmål og setter over til en ansatt når det
            faktisk trengs et menneske.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: "#4A4D40", margin: "0 0 18px" }}>
            I motsetning til et tradisjonelt sentralbord eller en telefonsvarer, forstår
            KI-resepsjonisten hva kunden faktisk spør om og løser saken der og da. KI Consult
            sin KI-resepsjonist er norskutviklet, svarer med naturlig norsk stemme på under
            300 millisekunder, støtter BankID- og Vipps-identifisering, og all data hostes i
            Norge i tråd med GDPR.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: "#4A4D40", margin: 0 }}>
            Typiske brukere er tannleger, klinikker, verksteder, eiendomsmeglere og andre
            bedrifter som taper kunder på ubesvarte anrop. Oppsettet tar 7 dager, krever ingen
            utvikler, og agenten kan{" "}
            <a href="#demo" style={{ color: "#15A06A", fontWeight: 600 }}>
              prøves gratis i nettleseren
            </a>{" "}
            før du bestemmer deg.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-pad" style={{ background: "#EDE8DB", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 820, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ ...eyebrowGreen, textAlign: "center" }}>Vanlige spørsmål</div>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(28px,3.6vw,44px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "14px 0 40px",
            }}
          >
            Alt du lurer på.
          </h2>
          {faqs.map((item, i) => (
            <div
              key={i}
              style={{
                background: "#FBFAF4",
                border: "1px solid #E2DCCB",
                borderRadius: 14,
                padding: "24px 26px",
                marginBottom: 12,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  margin: "0 0 8px",
                }}
              >
                {item.q}
              </h3>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "#4A4D40", margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        className="section-pad"
        style={{
          background: "#0B2118",
          backgroundImage:
            "radial-gradient(800px 400px at 50% 0%, rgba(21,192,124,0.18), transparent 60%)",
          color: "#EFEDE2",
          padding: "104px 0",
        }}
      >
        <div className="section-inner" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
          <h2
            style={{
              fontSize: "clamp(32px,4.2vw,56px)",
              lineHeight: 1.04,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              textWrap: "balance",
            }}
          >
            Konkurrenten svarer ikke 24/7. Det gjør du.
          </h2>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.5,
              color: "#B4C5BB",
              margin: "22px auto 0",
              maxWidth: "50ch",
            }}
          >
            Kom i gang gratis i dag. Live på 7 dager, ingen binding, og {gDays} dagers
            pengene-tilbake hvis du ikke er fornøyd.
          </p>
          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              marginTop: 34,
              flexWrap: "wrap",
            }}
          >
            <a
              href="#demo"
              className="btn-primary"
              style={{
                color: "#08231A",
                fontWeight: 700,
                fontSize: 18,
                padding: "18px 32px",
                borderRadius: 13,
                textDecoration: "none",
                boxShadow: "0 12px 34px rgba(21,192,124,0.34)",
              }}
            >
              Snakk med AI-agenten →
            </a>
            <a
              href="#book"
              className="btn-outline"
              style={{
                background: "transparent",
                color: "#EFEDE2",
                fontWeight: 600,
                fontSize: 18,
                padding: "18px 30px",
                borderRadius: 13,
                textDecoration: "none",
              }}
            >
              Book et møte →
            </a>
          </div>
          <div style={{ fontSize: 14, color: "#8DA298", marginTop: 18 }}>
            Ingen kredittkort nødvendig.
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#08160F", color: "#9FB3A7", padding: "56px 0 40px" }}>
        <div
          className="footer-grid section-inner"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 32px",
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
            gap: 32,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.03em", color: "#EFEDE2" }}>
              KI Consult<span style={{ color: "#3FE0A0" }}>.no</span>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: "14px 0 0", maxWidth: "34ch" }}>
              Norskutviklede AI-agenter for telefon, web og chat. Vi hjelper bedrifter med å
              aldri miste en kunde - døgnet rundt.
            </p>
          </div>
          <div>
            <div style={footerHeading}>Løsninger</div>
            <div style={footerCol}>
              <a href="#" className="footer-link" style={footerLink}>AI-chatbot</a>
              <a href="#" className="footer-link" style={footerLink}>AI-telefoni</a>
              <a href="#" className="footer-link" style={footerLink}>Tale-widget</a>
              <a href="#" className="footer-link" style={footerLink}>Integrasjoner</a>
            </div>
          </div>
          <div>
            <div style={footerHeading}>Selskap</div>
            <div style={footerCol}>
              <a href="#priser" className="footer-link" style={footerLink}>Priser</a>
              <a href="#bransjer" className="footer-link" style={footerLink}>Bransjer</a>
              <a href="#faq" className="footer-link" style={footerLink}>FAQ</a>
              <a href="#" className="footer-link" style={footerLink}>Bli partner</a>
            </div>
          </div>
          <div>
            <div style={footerHeading}>Kontakt</div>
            <div style={footerCol}>
              <span>934 38 816</span>
              <span>hei@kiconsult.no</span>
              <span>Oslo, Norge</span>
            </div>
          </div>
        </div>
        <div
          className="section-inner"
          style={{
            maxWidth: 1180,
            margin: "40px auto 0",
            padding: "20px 32px 0",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 13,
            color: "#6E8076",
          }}
        >
          <span>© 2026 KI Consult AS</span>
          <span style={{ display: "flex", gap: 18 }}>
            <a href="#" className="footer-link" style={footerLink}>Vilkår</a>
            <a href="#" className="footer-link" style={footerLink}>Personvern</a>
            <a href="#" className="footer-link" style={footerLink}>Systemstatus</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/* --- Shared style fragments --- */
const cardLight: CSSProperties = {
  background: "#FBFAF4",
  border: "1px solid #E6E0D0",
  borderRadius: 16,
  padding: 28,
};

const eyebrowGreen: CSSProperties = {
  fontFamily: mono,
  fontSize: 13,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "#15A06A",
  fontWeight: 700,
};

const footerHeading: CSSProperties = {
  color: "#EFEDE2",
  fontWeight: 700,
  fontSize: 14,
  marginBottom: 12,
};

const footerCol: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
  fontSize: 14,
};

const footerLink: CSSProperties = {
  textDecoration: "none",
};
