import type { CSSProperties } from "react";
import VoiceDemo from "@/components/VoiceDemo";
import TrustLogos from "@/components/TrustLogos";
import { gDays, steps, features, industries, faqs } from "@/lib/content";

const mono = "var(--font-space-mono), monospace";

export default function Home() {
  return (
    <div>
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
              href="#"
              style={{
                color: "#16190F",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 15,
                padding: "9px 6px",
              }}
            >
              Logg inn
            </a>
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
            padding: "74px 32px 0",
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
              Norskutviklet AI-kundeservice
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
              Konkurrenten svarer ikke kl.&nbsp;02:00. Det gjør du.
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
              KI-agenten som tar telefonen, chatten og webhenvendelsene dine automatisk.
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
                {gDays} dagers pengene-tilbake-garanti
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
              20 minutter — vi viser plattformen live med din egen case.
            </p>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3A3D31" }}>Bedrift</label>
            <input
              type="text"
              placeholder="Bedriftsnavn"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 11,
                border: "1px solid #E2DCCB",
                background: "#FFFFFF",
                fontSize: 15,
                fontFamily: "inherit",
                margin: "6px 0 14px",
              }}
            />
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3A3D31" }}>Telefon</label>
            <input
              type="tel"
              placeholder="+47 000 00 000"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 11,
                border: "1px solid #E2DCCB",
                background: "#FFFFFF",
                fontSize: 15,
                fontFamily: "inherit",
                margin: "6px 0 18px",
              }}
            />
            <a
              href="#"
              className="btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                color: "#08231A",
                fontWeight: 700,
                fontSize: 16,
                padding: 16,
                borderRadius: 12,
                textDecoration: "none",
              }}
            >
              Book demoen min →
            </a>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                marginTop: 16,
                fontSize: 13,
                color: "#5C5F52",
              }}
            >
              <span style={{ color: "#15A06A" }}>✓</span>GDPR{" "}
              <span style={{ color: "#15A06A" }}>✓</span>Hostet i Norge{" "}
              <span style={{ color: "#15A06A" }}>✓</span>BankID{" "}
              <span style={{ color: "#15A06A" }}>✓</span>Ingen lock-in
            </div>
          </div>
        </div>

        {/* Trust logos */}
        <div
          className="section-inner"
          style={{
            maxWidth: 1200,
            margin: "64px auto 0",
            padding: "30px 32px 40px",
            borderTop: "1px solid rgba(255,255,255,0.09)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#7C8E83",
              marginBottom: 22,
            }}
          >
            Bygget for norske bedrifter i regulerte bransjer
          </div>
          <TrustLogos />
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
              Snakk med en norsk AI-agent — akkurat nå.
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
              sanntid. Naturlig norsk stemme — rett i nettleseren.
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

      {/* INDUSTRIES */}
      <section id="bransjer" className="section-pad" style={{ background: "#F3EFE4", padding: "96px 0" }}>
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

      {/* GUARANTEE */}
      <section className="section-pad" style={{ background: "#0B2118", color: "#EFEDE2", padding: "96px 0" }}>
        <div className="section-inner" style={{ maxWidth: 880, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "rgba(63,224,160,0.14)",
              color: "#3FE0A0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              margin: "0 auto",
            }}
          >
            🛡
          </div>
          <h2
            style={{
              fontSize: "clamp(28px,3.6vw,46px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              margin: "24px 0 0",
              textWrap: "balance",
            }}
          >
            {gDays} dagers pengene-tilbake-garanti. Null risiko.
          </h2>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: "#B4C5BB",
              margin: "20px auto 0",
              maxWidth: "54ch",
            }}
          >
            Prøv KI Consult i {gDays} dager. Hvis agenten ikke gir deg verdi, sier du ifra og får
            hver krone tilbake — ingen spørsmål. Det er enklere å si ja enn å si nei.
          </p>
          <a
            href="#demo"
            className="btn-primary"
            style={{
              display: "inline-block",
              marginTop: 32,
              color: "#08231A",
              fontWeight: 700,
              fontSize: 17,
              padding: "17px 30px",
              borderRadius: 13,
              textDecoration: "none",
              boxShadow: "0 10px 30px rgba(21,192,124,0.3)",
            }}
          >
            Snakk med AI-agenten →
          </a>
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
            Konkurrenten svarer ikke kl. 02:00. Det gjør du.
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
              aldri miste en kunde — døgnet rundt.
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

const priceCard: CSSProperties = {
  background: "#FBFAF4",
  border: "1px solid #E2DCCB",
  borderRadius: 16,
  padding: 26,
};

const priceRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 5,
  margin: "16px 0",
};

const priceBig: CSSProperties = {
  fontSize: 38,
  fontWeight: 800,
  letterSpacing: "-0.03em",
};

const priceCtaDark: CSSProperties = {
  display: "block",
  textAlign: "center",
  color: "#F3EFE4",
  fontWeight: 700,
  fontSize: 15,
  padding: 13,
  borderRadius: 11,
  textDecoration: "none",
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
