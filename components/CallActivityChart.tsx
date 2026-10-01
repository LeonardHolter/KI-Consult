"use client";

import { useCallback, useEffect, useState } from "react";
import type { CallDay } from "@/lib/callActivity";

// Fourteen days of phone activity on the CLIENT's own dashboard: calls per
// day and voice minutes per day. The admin overview has the same pair across
// every client (app/portal/ActivityCharts.tsx); this one is one client's own
// line, so it drops the chat series — a shop that only has a phone agent
// should not be shown an empty series to explain.
//
// Two charts on a shared day-axis rather than one with two y-axes: calls and
// minutes have no common scale, and a dual axis invites a comparison between
// the two heights that means nothing.
//
// Colors and type follow ActivityCharts, which was validated against the same
// white card: ink/muted for text, the series color only on the marks.

const INK = "#16190f";
const MUTED = "#9a9a8c";
const GRID = "#E6E0D0";
const VOICE = "#0d6b47";
/** The hovered bar only — lighter than the series green, so the day under
 *  the cursor reads as lit rather than as a different kind of data. */
const VOICE_LIT = "#15a06a";
const BAND = "rgba(22,25,15,0.05)";

const W = 640;
const H = 182;
const PAD = { top: 16, right: 8, bottom: 34, left: 38 };

function topRoundedBar(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

/** A y-axis that ends on a round number, so the gridline labels are readable
 *  values rather than whatever the busiest day happened to be. */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (n <= m * pow) return m * pow;
  }
  return 10 * pow;
}

function DayBars({
  title,
  days,
  value,
  fmtY,
  fmtTip,
  hover,
  onHover,
}: {
  title: string;
  days: CallDay[];
  value: (d: CallDay) => number;
  fmtY: (v: number) => string;
  fmtTip: (d: CallDay) => string;
  /** Index of the day under the cursor, in EITHER chart — both light up the
   *  same day, so the pair reads as one fortnight instead of two. */
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, days.length);
  const barW = Math.min(26, step * 0.62);
  const yMax = niceMax(Math.max(...days.map(value), 0));

  const tipDay = hover !== null ? days[hover] : null;
  const tipX = hover !== null ? PAD.left + hover * step + step / 2 : 0;

  return (
    <div
      style={{ flex: 1, minWidth: 420, position: "relative" }}
      onMouseLeave={() => onHover(null)}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 6 }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} fontSize={11} fill={MUTED} textAnchor="end">
                {fmtY(yMax * f)}
              </text>
            </g>
          );
        })}

        {days.map((d, i) => {
          const v = value(d);
          const h = yMax > 0 ? (v / yMax) * innerH : 0;
          const x = PAD.left + i * step + (step - barW) / 2;
          const lit = hover === i;
          return (
            <g key={d.date}>
              {/* The lit column runs the full height and behind the bar, so a
                  day with no calls still shows which day you are on. */}
              {lit && (
                <rect
                  x={PAD.left + i * step}
                  y={PAD.top}
                  width={step}
                  height={innerH}
                  fill={BAND}
                />
              )}
              <path
                d={topRoundedBar(x, PAD.top + innerH - h, barW, h)}
                fill={lit ? VOICE_LIT : VOICE}
              />
              <text
                x={PAD.left + i * step + step / 2}
                y={H - 16}
                fontSize={10.5}
                fontWeight={lit ? 700 : 400}
                fill={lit ? INK : MUTED}
                textAnchor="middle"
              >
                {d.label}
              </text>
              {/* Hit area last, so it sits above the marks: hovering a quiet
                  day must work even though its bar is a sliver or nothing. */}
              <rect
                x={PAD.left + i * step}
                y={PAD.top}
                width={step}
                height={innerH + PAD.bottom - 6}
                fill="transparent"
                onMouseEnter={() => onHover(i)}
              />
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke={INK}
          strokeWidth={1.5}
        />
      </svg>

      {tipDay && (
        <div
          style={{
            position: "absolute",
            left: `${(tipX / W) * 100}%`,
            top: 20,
            transform: tipX > W * 0.62 ? "translateX(-105%)" : "translateX(8px)",
            background: "#0B2118",
            color: "#D8E4DC",
            borderRadius: 8,
            padding: "8px 11px",
            fontSize: 12.5,
            lineHeight: 1.5,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          {fmtTip(tipDay)}
        </div>
      )}
    </div>
  );
}

/** «torsdag 1. oktober» — the tooltip says the weekday out loud, because a
 *  shop thinks in «last Thursday», not in «1.10». */
function fullDate(d: CallDay): string {
  return new Intl.DateTimeFormat("no-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Oslo",
  }).format(new Date(`${d.date}T12:00:00Z`));
}

export default function CallActivityChart({ clientId }: { clientId?: string }) {
  const [days, setDays] = useState<CallDay[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  const qs = clientId ? `?client=${clientId}` : "";
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/activity${qs}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as { show?: boolean; days?: CallDay[] };
    } catch {
      return null;
    }
  }, [qs]);

  useEffect(() => {
    let cancelled = false;
    load().then((body) => {
      if (cancelled || !body) return;
      if (body.show === false) setHidden(true);
      else setDays(body.days ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (hidden || !days) return null;

  const totalCalls = days.reduce((n, d) => n + d.calls, 0);
  // A fortnight with nothing in it is a real answer, but a chart of fourteen
  // empty bars looks broken. Say it in words instead.
  if (totalCalls === 0) {
    return (
      <div className="ctp-card" style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Siste 14 dager</div>
        <p style={{ fontSize: 13, color: MUTED, margin: "6px 0 0" }}>
          Ingen samtaler registrert ennå. Grafen fylles så snart agenten har tatt sin første.
        </p>
      </div>
    );
  }

  const totalMinutes = Math.round(days.reduce((n, d) => n + d.minutes, 0));

  return (
    <div className="ctp-card" style={{ padding: "18px 20px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Siste 14 dager</div>
        <div style={{ fontSize: 12.5, color: MUTED }}>
          {totalCalls} {totalCalls === 1 ? "samtale" : "samtaler"} · {totalMinutes} min
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <DayBars
          title="Samtaler per dag"
          days={days}
          value={(d) => d.calls}
          fmtY={(v) => String(Math.round(v))}
          fmtTip={(d) =>
            `${fullDate(d)}: ${d.calls} ${d.calls === 1 ? "samtale" : "samtaler"}`
          }
          hover={hover}
          onHover={setHover}
        />
        <DayBars
          title="Taleminutter per dag"
          days={days}
          value={(d) => d.minutes}
          fmtY={(v) => String(Math.round(v))}
          fmtTip={(d) => `${fullDate(d)}: ${d.minutes.toFixed(1).replace(".", ",")} min`}
          hover={hover}
          onHover={setHover}
        />
      </div>
    </div>
  );
}
