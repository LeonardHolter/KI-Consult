"use client";

import { useCallback, useEffect, useState } from "react";

// Admin controls for the KPI card on /portal/integrasjoner: show/hide the
// tiles on the client's dashboard, and the non-destructive reset that moves
// the KPI epoch to now (old rows stay — the admin cost figures need them).

export default function KpiControls({ clientId }: { clientId: string }) {
  const [show, setShow] = useState<boolean | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/kpi-settings?client=${clientId}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as { showKpis: boolean; kpiSince: string | null };
    } catch {
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    fetchState().then((s) => {
      if (cancelled || !s) return;
      setShow(s.showKpis);
      setSince(s.kpiSince);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  async function post(body: Record<string, unknown>, doneMsg: string) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/kpi-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Kunne ikke lagre.");
      setShow(Boolean(d.showKpis));
      setSince(d.kpiSince ?? null);
      setStatus(doneMsg);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
      setConfirmingReset(false);
    }
  }

  if (show === null) return <p className="ccm-hint">Laster…</p>;

  return (
    <>
      <span className="ccm-label">Vis på kundens dashbord</span>
      <div className="ccm-seg">
        <button type="button" className={show ? "on" : ""} disabled={busy} onClick={() => post({ show: true }, "KPI-flisene vises på kundens dashbord.")}>
          Vis KPI-er
          <small>Bookingverdi, anrop og spart tid øverst</small>
        </button>
        <button type="button" className={show ? "" : "on"} disabled={busy} onClick={() => post({ show: false }, "KPI-flisene er skjult for kunden.")}>
          Skjul KPI-er
          <small>Kunden ser ingen tall</small>
        </button>
      </div>

      <span className="ccm-label">Nullstill tallene</span>
      <p className="ccm-hint">
        Flisene teller kun aktivitet etter siste nullstilling
        {since ? ` (nå: ${new Date(since).toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })})` : " (aldri nullstilt)"}.
        Nullstilling sletter ingenting — historikk og kostnadstall beholdes.
      </p>
      <div className="ccm-actions">
        <button
          type="button"
          className="ccm-btn ghost"
          disabled={busy}
          onBlur={() => setConfirmingReset(false)}
          onClick={() =>
            confirmingReset
              ? post({ reset: true }, "Nullstilt — flisene teller fra nå.")
              : setConfirmingReset(true)
          }
          style={confirmingReset ? { background: "#c2562c", color: "#fff", borderColor: "#c2562c" } : undefined}
        >
          {busy ? "Lagrer…" : confirmingReset ? "Sikker? Nullstill nå" : "Nullstill KPI-er"}
        </button>
      </div>
      {status && <p className="ccm-status">{status}</p>}
    </>
  );
}
