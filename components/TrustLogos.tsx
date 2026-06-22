"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const mono = "var(--font-space-mono), monospace";

interface Logo {
  /** Display name + image alt text. */
  name: string;
  /** Official logo file under /public/logos. Add the real SVG to enable it. */
  file: string;
  transform?: CSSProperties["textTransform"];
  tracking?: string;
}

// Drop the official SVGs into public/logos/ (filenames below) to show the real
// logos. Until a file exists, the styled wordmark is shown as a fallback so the
// band never renders a broken image.
const logos: Logo[] = [
  { name: "vipps", file: "/logos/vipps.png", transform: "lowercase", tracking: "-0.03em" },
  { name: "BankID", file: "/logos/bankid.png" },
  { name: "DNB", file: "/logos/dnb.png", tracking: "0.02em" },
  { name: "Telenor", file: "/logos/telenor.svg" },
  { name: "Posten", file: "/logos/posten.png" },
];

function Wordmark({ logo }: { logo: Logo }) {
  // Fallback sits on the white chip, so use a dark, readable colour.
  return (
    <span
      style={{
        fontWeight: 800,
        fontSize: 20,
        letterSpacing: logo.tracking ?? "-0.02em",
        textTransform: logo.transform,
        color: "#2A3D33",
      }}
    >
      {logo.name}
    </span>
  );
}

function LogoItem({ logo }: { logo: Logo }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image may finish loading (and error) before React hydrates and attaches
  // the onError handler. Detect that case on mount: a complete image with zero
  // natural width means the file is missing, so fall back to the wordmark.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    // White chip so full-colour logos (and dark wordmarks) stay visible on the
    // dark-green band.
    <div
      style={{
        height: 60,
        background: "#FBFAF4",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 18px",
        overflow: "hidden",
      }}
    >
      {failed ? (
        <Wordmark logo={logo} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={logo.file}
          alt={logo.name}
          onError={() => setFailed(true)}
          style={{
            maxHeight: 30,
            maxWidth: "100%",
            width: "auto",
            objectFit: "contain",
          }}
        />
      )}
    </div>
  );
}

export default function TrustLogos() {
  return (
    <div
      className="trust-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5,1fr)",
        gap: 18,
        maxWidth: 840,
        margin: "0 auto",
      }}
    >
      {logos.map((logo) => (
        <LogoItem key={logo.name} logo={logo} />
      ))}
    </div>
  );
}
