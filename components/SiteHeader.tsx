import Link from "next/link";

const mono = "var(--font-space-mono), monospace";

/**
 * Delt topp-navigasjon brukt på undersider (f.eks. bloggen). Lenkene peker til
 * forsidens seksjoner via "/#..." slik at de virker fra hvilken som helst side.
 */
export default function SiteHeader() {
  return (
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
        <Link
          href="/"
          style={{
            fontWeight: 800,
            fontSize: 21,
            letterSpacing: "-0.03em",
            textDecoration: "none",
            color: "#16190F",
          }}
        >
          KI&nbsp;Consult<span style={{ color: "#15A06A" }}>.no</span>
        </Link>
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
          <Link href="/#funksjoner" className="nav-link" style={{ textDecoration: "none" }}>
            Funksjoner
          </Link>
          <Link href="/#bransjer" className="nav-link" style={{ textDecoration: "none" }}>
            Bransjer
          </Link>
          <Link href="/#priser" className="nav-link" style={{ textDecoration: "none" }}>
            Priser
          </Link>
          <Link
            href="/blog"
            className="nav-link"
            style={{ textDecoration: "none", fontFamily: mono, fontSize: 14 }}
          >
            Blogg
          </Link>
        </nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/#demo"
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
          </Link>
        </div>
      </div>
    </header>
  );
}
