"use client";

import type { CSSProperties } from "react";

interface Brand {
  name: string;
  file: string;
}

const brands: Brand[] = [
  { name: "REBIL", file: "/logos/rebil.png" },
  { name: "Sporty", file: "/logos/sporty.png" },
  { name: "RSA", file: "/logos/rsa.png" },
  { name: "Belron", file: "/logos/belron.png" },
  { name: "Defigo", file: "/logos/defigo.png" },
  { name: "Vanylven kommune", file: "/logos/vanlyven.png" },
];

// Each logo sits on a white chip so coloured marks stay visible on the dark
// band. The track holds two identical copies side by side; the animation slides
// it by exactly one copy's width, so the loop is seamless.
const chip: CSSProperties = {
  flex: "0 0 auto",
  height: 56,
  background: "#FBFAF4",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 26px",
};

function LogoSet({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden}
      style={{ display: "flex", gap: 18, paddingRight: 18, flex: "0 0 auto" }}
    >
      {brands.map((b) => (
        <div key={b.name} style={chip}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.file}
            alt={b.name}
            style={{ height: 30, width: "auto", objectFit: "contain", display: "block" }}
          />
        </div>
      ))}
    </div>
  );
}

export default function LogoMarquee() {
  return (
    <div
      style={{
        overflow: "hidden",
        maxWidth: 840,
        margin: "0 auto",
        // Fade the edges so logos slide in/out softly.
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <div className="logo-marquee-track" style={{ display: "flex", width: "max-content" }}>
        <LogoSet />
        <LogoSet ariaHidden />
      </div>

      <style>{`
        .logo-marquee-track {
          animation: logo-marquee 22s linear infinite;
        }
        /* Travel left → right: start shifted one copy left, slide back to 0. */
        @keyframes logo-marquee {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-marquee-track { animation: none; transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
