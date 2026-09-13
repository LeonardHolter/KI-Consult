"use client";

import { useCallback, useEffect, useState } from "react";

// Toggle for whether this client's own dashboard shows the booking calendar
// (grid, live/test switch, customer list). Mirrors ChatWidgetToggle and
// reuses the same ccm-* styles rendered by GoogleCalendarConnect.

export default function CalendarVisibilityToggle({ clientId }: { clientId: string }) {
  const [show, setShow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/dashboard-calendar?client=${clientId}`, { cache: "no-store" });
      if (!res.ok) return null;
      return Boolean((await res.json()).showCalendar);
    } catch {
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    fetchState().then((v) => {
      if (!cancelled) setShow(v);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  async function set(next: boolean) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/dashboard-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, show: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kunne ikke lagre.");
      setShow(next);
      setStatus(
        next
          ? "Kalenderen vises på kundens dashbord."
          : "Kalenderen er skjult på kundens dashbord — de ser KPI-er, taleagent, opptak og transkripsjoner.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  if (show === null) return <p className="ccm-hint">Laster…</p>;

  return (
    <>
      <span className="ccm-label">Vis på kundens dashbord</span>
      <div className="ccm-seg">
        <button type="button" className={show ? "on" : ""} disabled={busy} onClick={() => set(true)}>
          Vis kalenderen
          <small>Bookinggrid, ekte/test-bryter og kundeliste</small>
        </button>
        <button type="button" className={show ? "" : "on"} disabled={busy} onClick={() => set(false)}>
          Skjul kalenderen
          <small>For agenter som bare tar imot henvendelser</small>
        </button>
      </div>
      {status && <p className="ccm-status">{status}</p>}
    </>
  );
}
