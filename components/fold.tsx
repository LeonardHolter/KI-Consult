"use client";

import { useEffect, useState, type ReactNode } from "react";

// Shared fold-away behavior for the dashboard panels: every section can
// collapse to just its header, and the choice sticks per browser via
// localStorage. Default is open; the stored state is applied in an effect so
// server and first client render always agree (no hydration mismatch — the
// cost is a brief flash for folded sections, which beats a console full of
// hydration warnings).

export function useFolded(key: string): [boolean, () => void] {
  // Folded is the DEFAULT (per Leonard): the dashboard opens compact and the
  // owner expands what they care about — only an explicit open ("0") sticks.
  const [folded, setFolded] = useState(true);
  useEffect(() => {
    // Async setState (never synchronous in the effect body — house rule, see
    // CustomerListPanel), with a cancelled-flag so a remount can't race.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        setFolded(localStorage.getItem(`fold:${key}`) !== "0");
      } catch {
        /* private mode etc. — stay folded */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  const toggle = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(`fold:${key}`, f ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !f;
    });
  return [folded, toggle];
}

/** The chevron that lives in each panel's own header row. */
export function FoldButton({ folded, onToggle }: { folded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!folded}
      aria-label={folded ? "Vis innhold" : "Skjul innhold"}
      style={{
        border: "1px solid #9a9a8c66",
        background: "transparent",
        borderRadius: 4,
        padding: "2px 9px",
        fontSize: 12,
        lineHeight: "18px",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "#16190f",
      }}
    >
      {folded ? "▸" : "▾"}
    </button>
  );
}

/** Fold wrapper for sections that have no header of their own (the agent
 *  card, the KPI row): a slim titled bar, content below when open. */
export function FoldSection({
  foldKey,
  title,
  children,
}: {
  foldKey: string;
  title: string;
  children: ReactNode;
}) {
  const [folded, toggle] = useFolded(foldKey);
  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!folded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          border: "1px solid rgba(154,154,140,.27)",
          borderBottom: folded ? "1px solid rgba(154,154,140,.27)" : "none",
          padding: "9px 14px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "#5c5f52",
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 12, color: "#16190f" }}>{folded ? "▸" : "▾"}</span>
      </button>
      {!folded && children}
    </section>
  );
}
