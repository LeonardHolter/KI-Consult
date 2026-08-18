"use client";

import { useCallback, useEffect, useState } from "react";

// The customer list card on the dashboard: everyone the agent has booked,
// one row per phone number, with the booking history inline and a CSV
// download that opens correctly in Norwegian-locale Excel. Fields the
// bookings didn't carry stay empty — the list never guesses.

type Row = {
  name: string;
  phone: string;
  car: string;
  regNr: string;
  history: { date: string; service: string }[];
};

export default function CustomerListPanel({ clientId }: { clientId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const qs = clientId ? `?client=${clientId}` : "";

  const fetchRows = useCallback(async (): Promise<Row[] | null> => {
    try {
      const res = await fetch(`/api/portal/customers${qs}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()).customers ?? [];
    } catch {
      return null;
    }
  }, [qs]);

  useEffect(() => {
    // Async fetch->setState (never synchronous in the effect body); the
    // cancelled flag keeps a stale client's response from overwriting the
    // newly selected client's list — same pattern as the other panels.
    let cancelled = false;
    fetchRows().then((r) => {
      if (cancelled) return;
      if (r === null) setError(true);
      else setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  return (
    <div className="clp-card">
      <style>{`
        .clp-card { background: #fff; border: 1px solid #9a9a8c44; border-radius: 12px; padding: 20px 22px; margin-top: 20px; }
        .clp-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
        .clp-head h2 { font-size: 17px; margin: 0; }
        .clp-sub { color: #9a9a8c; font-size: 13.5px; margin: 0 0 12px; }
        .clp-dl { margin-left: auto; border: 1px solid #9a9a8c66; background: transparent; color: #16190f; border-radius: 8px; padding: 4px 12px; font-size: 12.5px; cursor: pointer; font-family: inherit; text-decoration: none; }
        .clp-scroll { overflow-x: auto; }
        .clp-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .clp-table th { text-align: left; color: #9a9a8c; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; padding: 8px 10px; border-bottom: 1px solid #9a9a8c33; white-space: nowrap; }
        .clp-table td { padding: 9px 10px; border-bottom: 1px solid #9a9a8c22; vertical-align: top; }
        .clp-hist { color: #5c5f52; }
        .clp-hist div { white-space: nowrap; }
        .clp-empty { color: #9a9a8c; padding: 24px 0; text-align: center; font-size: 13.5px; }
      `}</style>
      <div className="clp-head">
        <h2>Kundeliste</h2>
        {rows !== null && rows.length > 0 && (
          <a className="clp-dl" href={`/api/portal/customers${qs ? `${qs}&` : "?"}format=csv`} download>
            Last ned CSV
          </a>
        )}
      </div>
      <p className="clp-sub">
        Alle kunder agentene har booket, med historikk. Felter agenten ikke fikk vite står tomme.
      </p>
      {error ? (
        <p className="clp-empty">Kunne ikke laste kundelisten. Prøv å oppdatere siden.</p>
      ) : rows === null ? (
        <p className="clp-empty">Laster…</p>
      ) : rows.length === 0 ? (
        <p className="clp-empty">Ingen bookinger ennå — kundene dukker opp her når agenten booker.</p>
      ) : (
        <div className="clp-scroll">
          <table className="clp-table">
            <thead>
              <tr>
                <th>Navn</th>
                <th>Telefonnummer</th>
                <th>Bil</th>
                <th>Reg.nr</th>
                <th>Historikk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.phone}>
                  <td>{r.name}</td>
                  <td>{r.phone}</td>
                  <td>{r.car}</td>
                  <td>{r.regNr}</td>
                  <td className="clp-hist">
                    {r.history.map((h, i) => (
                      <div key={i}>
                        {h.date}: {h.service}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
