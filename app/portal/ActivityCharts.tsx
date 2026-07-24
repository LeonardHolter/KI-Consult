"use client";

import { useState } from "react";
import type { DayActivity } from "@/lib/admin/data";

// Admin usage charts: daily activity across all clients for the last 14
// days. Two charts on one shared day-axis pattern — conversations per day
// (chat vs voice, grouped bars) and voice minutes per day (single series)
// — kept as SEPARATE charts rather than a dual axis on purpose.
//
// Colors are validated (dataviz six-checks) against the white card surface:
// chat #3b6ea5 / tale #0d6b47 pass CVD separation; the tritan floor band is
// covered by secondary encoding (fixed pair order, gaps, legend, direct
// labels). Text wears ink/muted, never the series color.

const INK = "#16190f";
const MUTED = "#9a9a8c";
const GRID = "#E6E0D0";
const CHAT = "#3b6ea5";
const VOICE = "#0d6b47";

const W = 640;
const H = 190;
const PAD = { top: 18, right: 8, bottom: 24, left: 34 };

/** Bar with a 4px rounded top (data end) and a square baseline end. */
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

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (n <= m * pow) return m * pow;
  }
  return 10 * pow;
}

type Tip = { x: number; day: DayActivity } | null;

function ChartFrame({
  title,
  yMax,
  yFmt,
  children,
  legend,
  tip,
  tipBody,
}: {
  title: string;
  yMax: number;
  yFmt?: (v: number) => string;
  children: React.ReactNode;
  legend?: { color: string; label: string }[];
  tip: Tip;
  tipBody?: (d: DayActivity) => React.ReactNode;
}) {
  const fmt = yFmt ?? ((v: number) => String(v));
  const innerH = H - PAD.top - PAD.bottom;
  return (
    <div style={{ flex: 1, minWidth: 300, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{title}</div>
        {legend && (
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: MUTED }}>
            {legend.map((l) => (
              <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} fontSize={11} fill={MUTED} textAnchor="end">
                {fmt(yMax * f)}
              </text>
            </g>
          );
        })}
        {children}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke={INK}
          strokeWidth={1.5}
        />
      </svg>
      {tip && tipBody && (
        <div
          style={{
            position: "absolute",
            left: `${(tip.x / W) * 100}%`,
            top: 24,
            transform: tip.x > W * 0.62 ? "translateX(-105%)" : "translateX(8px)",
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
          {tipBody(tip.day)}
        </div>
      )}
    </div>
  );
}

export default function ActivityCharts({ days }: { days: DayActivity[] }) {
  const [tipA, setTipA] = useState<Tip>(null);
  const [tipB, setTipB] = useState<Tip>(null);

  const totals = days.reduce(
    (a, d) => ({
      chat: a.chat + d.chat,
      voice: a.voice + d.voice,
      minutes: a.minutes + d.voiceMinutes,
      booked: a.booked + d.booked,
    }),
    { chat: 0, voice: 0, minutes: 0, booked: 0 },
  );
  const empty = totals.chat === 0 && totals.voice === 0;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.min(14, (slot - 8) / 2);

  const maxConv = niceMax(Math.max(...days.map((d) => Math.max(d.chat, d.voice)), 1));
  const maxMin = niceMax(Math.max(...days.map((d) => d.voiceMinutes), 1));
  const peakConv = Math.max(...days.map((d) => Math.max(d.chat, d.voice)));
  const peakMin = Math.max(...days.map((d) => d.voiceMinutes));

  const x0 = (i: number) => PAD.left + slot * i + slot / 2;
  const yOf = (v: number, max: number) => PAD.top + innerH * (1 - v / max);

  const axisLabels = (which: "a" | "b") =>
    days.map((d, i) =>
      i % 2 === (days.length % 2 === 0 ? 1 : 0) ? (
        <text
          key={`${which}-${d.date}`}
          x={x0(i)}
          y={H - 8}
          fontSize={10.5}
          fill={MUTED}
          textAnchor="middle"
        >
          {d.label}
        </text>
      ) : null,
    );

  const hoverTargets = (setTip: (t: Tip) => void) =>
    days.map((d, i) => (
      <rect
        key={`h-${d.date}`}
        x={PAD.left + slot * i}
        y={PAD.top}
        width={slot}
        height={innerH}
        fill="transparent"
        onMouseEnter={() => setTip({ x: x0(i), day: d })}
        onMouseLeave={() => setTip(null)}
      />
    ));

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${MUTED}33`,
        borderRadius: 12,
        padding: "18px 22px",
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, letterSpacing: "-0.02em" }}>Aktivitet</h2>
        <span style={{ fontSize: 12.5, color: MUTED }}>siste 14 dager, alle kunder</span>
      </div>

      {/* 14-day totals */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { v: totals.chat, l: "chat-samtaler" },
          { v: totals.voice, l: "tale-samtaler" },
          { v: Math.round(totals.minutes), l: "taleminutter" },
          { v: totals.booked, l: "bookinger (chat)" },
        ].map((t) => (
          <div
            key={t.l}
            style={{
              background: "#FBFAF4",
              border: `1px solid ${GRID}`,
              borderRadius: 10,
              padding: "10px 16px",
              minWidth: 110,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: INK }}>
              {t.v}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>{t.l}</div>
          </div>
        ))}
      </div>

      {empty ? (
        <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>
          Ingen aktivitet registrert de siste 14 dagene.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <ChartFrame
            title="Samtaler per dag"
            yMax={maxConv}
            legend={[
              { color: CHAT, label: "Chat" },
              { color: VOICE, label: "Tale" },
            ]}
            tip={tipA}
            tipBody={(d) => (
              <>
                <strong>{d.label}</strong>
                <br />
                Chat: {d.chat} {d.booked > 0 && `(${d.booked} booket)`}
                <br />
                Tale: {d.voice}
              </>
            )}
          >
            {days.map((d, i) => (
              <g key={d.date}>
                <path
                  d={topRoundedBar(x0(i) - barW - 1, yOf(d.chat, maxConv), barW, (innerH * d.chat) / maxConv)}
                  fill={CHAT}
                />
                <path
                  d={topRoundedBar(x0(i) + 1, yOf(d.voice, maxConv), barW, (innerH * d.voice) / maxConv)}
                  fill={VOICE}
                />
                {/* Selective direct labels: only the period peak(s). */}
                {d.chat === peakConv && d.chat > 0 && (
                  <text x={x0(i) - barW / 2 - 1} y={yOf(d.chat, maxConv) - 5} fontSize={11} fontWeight={700} fill={INK} textAnchor="middle">
                    {d.chat}
                  </text>
                )}
                {d.voice === peakConv && d.voice > 0 && d.chat !== peakConv && (
                  <text x={x0(i) + barW / 2 + 1} y={yOf(d.voice, maxConv) - 5} fontSize={11} fontWeight={700} fill={INK} textAnchor="middle">
                    {d.voice}
                  </text>
                )}
              </g>
            ))}
            {axisLabels("a")}
            {hoverTargets(setTipA)}
          </ChartFrame>

          <ChartFrame
            title="Taleminutter per dag"
            yMax={maxMin}
            tip={tipB}
            tipBody={(d) => (
              <>
                <strong>{d.label}</strong>
                <br />
                {d.voiceMinutes.toFixed(1)} min ({d.voice} samtaler)
              </>
            )}
          >
            {days.map((d, i) => (
              <g key={d.date}>
                <path
                  d={topRoundedBar(x0(i) - barW / 2, yOf(d.voiceMinutes, maxMin), barW, (innerH * d.voiceMinutes) / maxMin)}
                  fill={VOICE}
                />
                {d.voiceMinutes === peakMin && d.voiceMinutes > 0 && (
                  <text x={x0(i)} y={yOf(d.voiceMinutes, maxMin) - 5} fontSize={11} fontWeight={700} fill={INK} textAnchor="middle">
                    {Math.round(d.voiceMinutes)}
                  </text>
                )}
              </g>
            ))}
            {axisLabels("b")}
            {hoverTargets(setTipB)}
          </ChartFrame>
        </div>
      )}

      {!empty && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12.5, color: MUTED, cursor: "pointer" }}>
            Vis som tabell
          </summary>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 }}>
            <thead>
              <tr>
                {["Dag", "Chat", "Tale", "Taleminutter", "Booket (chat)"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "4px 10px", borderBottom: `1px solid ${INK}`, color: INK }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td style={{ padding: "3px 10px", textAlign: "right", color: MUTED }}>{d.label}</td>
                  <td style={{ padding: "3px 10px", textAlign: "right" }}>{d.chat}</td>
                  <td style={{ padding: "3px 10px", textAlign: "right" }}>{d.voice}</td>
                  <td style={{ padding: "3px 10px", textAlign: "right" }}>{d.voiceMinutes.toFixed(1)}</td>
                  <td style={{ padding: "3px 10px", textAlign: "right" }}>{d.booked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
