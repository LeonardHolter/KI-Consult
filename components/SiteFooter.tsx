import Link from "next/link";
import type { CSSProperties } from "react";

/** Delt bunntekst brukt på undersider (f.eks. bloggen). */
export default function SiteFooter() {
  return (
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
            <Link href="/#funksjoner" className="footer-link" style={footerLink}>AI-chatbot</Link>
            <Link href="/#funksjoner" className="footer-link" style={footerLink}>AI-telefoni</Link>
            <Link href="/#funksjoner" className="footer-link" style={footerLink}>Tale-widget</Link>
            <Link href="/#funksjoner" className="footer-link" style={footerLink}>Integrasjoner</Link>
          </div>
        </div>
        <div>
          <div style={footerHeading}>Selskap</div>
          <div style={footerCol}>
            <Link href="/#priser" className="footer-link" style={footerLink}>Priser</Link>
            <Link href="/#bransjer" className="footer-link" style={footerLink}>Bransjer</Link>
            <Link href="/blog" className="footer-link" style={footerLink}>Blogg</Link>
            <Link href="/#faq" className="footer-link" style={footerLink}>FAQ</Link>
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
  );
}

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
