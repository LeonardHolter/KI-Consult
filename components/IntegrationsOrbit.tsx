"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface Node {
  name: string;
  /** Logo file under /public/logos. */
  file: string;
  /** Brand colour for the wordmark fallback. */
  color: string;
  /** 0 = inner ring, 1 = outer ring. */
  ring: 0 | 1;
  /** Angle in degrees, 0 = right, counter-clockwise positive. */
  angle: number;
}

// Inner ring sits closer to BankID, outer ring further out. Angles are spread
// so nothing overlaps. Tweak angle/ring to re-balance the constellation.
const nodes: Node[] = [
  { name: "Slack", file: "/logos/slack.svg", color: "#611F69", ring: 0, angle: 145 },
  { name: "Jira", file: "/logos/jira.svg", color: "#2684FF", ring: 0, angle: 70 },
  { name: "Vipps", file: "/logos/vipps.png", color: "#FF5B24", ring: 0, angle: 250 },
  { name: "Intercom", file: "/logos/intercom.svg", color: "#1F8DED", ring: 0, angle: 320 },
  { name: "Zendesk", file: "/logos/zendesk.svg", color: "#03363D", ring: 1, angle: 108 },
  { name: "Salesforce", file: "/logos/salesforce.svg", color: "#00A1E0", ring: 1, angle: 25 },
  { name: "HubSpot", file: "/logos/hubspot.svg", color: "#FF7A59", ring: 1, angle: 300 },
  { name: "Teams", file: "/logos/teams.svg", color: "#5059C9", ring: 1, angle: 235 },
  { name: "Outlook", file: "/logos/outlook.svg", color: "#0078D4", ring: 1, angle: 200 },
  { name: "Zoom", file: "/logos/zoom.svg", color: "#0B5CFF", ring: 1, angle: 160 },
];

// Ring radii as a percentage of the container half-width.
const R_INNER = 27;
const R_OUTER = 45;

function nodePosition(node: Node) {
  const r = node.ring === 0 ? R_INNER : R_OUTER;
  const rad = (node.angle * Math.PI) / 180;
  // Y is inverted because screen coordinates grow downward.
  const left = 50 + r * Math.cos(rad);
  const top = 50 - r * Math.sin(rad);
  return { left: `${left}%`, top: `${top}%` };
}

const chipBase: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  height: 58,
  minWidth: 58,
  padding: "0 14px",
  borderRadius: 999,
  background: "#FFFFFF",
  border: "1px solid #ECE6D7",
  boxShadow: "0 8px 22px rgba(11,33,24,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function LogoChip({ node }: { node: Node }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pos = nodePosition(node);

  // The image may finish loading (and error) before React hydrates and attaches
  // onError. Detect that case on mount and fall back to the wordmark.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <div style={{ ...chipBase, ...pos }}>
      {failed ? (
        <span style={{ color: node.color, fontWeight: 800, fontSize: 13, letterSpacing: "-0.02em" }}>
          {node.name}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={node.file}
          alt={node.name}
          onError={() => setFailed(true)}
          style={{ height: 26, width: "auto", maxWidth: 96, objectFit: "contain", display: "block" }}
        />
      )}
    </div>
  );
}

export default function IntegrationsOrbit() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        aspectRatio: "1 / 1",
      }}
    >
      {/* Concentric rings */}
      {[R_OUTER, R_INNER].map((r) => (
        <div
          key={r}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${r * 2}%`,
            height: `${r * 2}%`,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: "1px solid rgba(11,33,24,0.12)",
          }}
        />
      ))}

      {/* Center: BankID */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          height: 76,
          padding: "0 24px",
          borderRadius: 999,
          background: "#FFFFFF",
          border: "1px solid #E2DCCB",
          boxShadow: "0 16px 40px rgba(11,33,24,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/bankid.png"
          alt="BankID"
          style={{ height: 30, width: "auto", objectFit: "contain" }}
        />
      </div>

      {/* Orbiting integration chips */}
      {nodes.map((node) => (
        <LogoChip key={node.name} node={node} />
      ))}
    </div>
  );
}
