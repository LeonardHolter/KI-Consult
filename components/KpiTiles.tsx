"use client";

import { useCallback, useEffect, useState } from "react";

// The money row at the top of the client dashboard: estimated booking value,
// rescued calls, hours saved, ROI. Values come from /api/portal/kpi, which
// prices each booking against the client's OWN price list — anything without
// a fixed price is surfaced as "uten fastpris", never guessed.

type Period = {
  bookings: number;
  valueNok: number;
  unpriced: number;
  calls: number;
  callSeconds: number;
  callsOutsideHours: number;
};

type Kpis = {
  month: Period;
  total: Period;
  monthlyPriceNok: number | null;
  roiMultiple: number | null;
};

function nok(n: number): string {
  return `${n.toLocaleString("no-NO").replace(/ /g, " ")} kr`;
}

function hours(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} t ${min % 60} min`;
}

export default function KpiTiles({ clientId }: { clientId?: string }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  const qs = clientId ? `?client=${clientId}` : "";
  const fetchKpis = useCallback(async (): Promise<Kpis | null> => {
    try {
      const res = await fetch(`/api/portal/kpi${qs}`, { cache: "no-store" });
      return res.ok ? ((await res.json()) as Kpis) : null;
    } catch {
      return null;
    }
  }, [qs]);

  useEffect(() => {
    let cancelled = false;
    fetchKpis().then((k) => {
      if (!cancelled && k) setKpis(k);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchKpis]);

  // Nothing to brag about yet — render nothing rather than a row of zeros.
  if (!kpis || (kpis.total.bookings === 0 && kpis.total.calls === 0)) return null;

  const { month, total, monthlyPriceNok, roiMultiple } = kpis;

  return (
    <div className="kpi-row">
      <style>{`
        .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .kpi-tile { background: #fff; border: 1px solid #9a9a8c44; border-radius: 12px; padding: 14px 16px; }
        .kpi-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9a8c; margin: 0 0 6px; }
        .kpi-value { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0; color: #16190f; }
        .kpi-sub { font-size: 12.5px; color: #5c5f52; margin: 4px 0 0; }
        .kpi-roi .kpi-value { color: #0d6b47; }
      `}</style>

      <div className="kpi-tile">
        <p className="kpi-label">Bookinger denne måneden</p>
        <p className="kpi-value">{month.bookings}</p>
        <p className="kpi-sub">
          Estimert verdi ~{nok(month.valueNok)}
          {month.unpriced > 0 ? ` · ${month.unpriced} uten fastpris` : ""}
        </p>
      </div>

      <div className="kpi-tile">
        <p className="kpi-label">Siden oppstart</p>
        <p className="kpi-value">{total.bookings} bookinger</p>
        <p className="kpi-sub">
          Estimert verdi ~{nok(total.valueNok)}
          {total.unpriced > 0 ? ` · ${total.unpriced} uten fastpris` : ""}
        </p>
      </div>

      <div className="kpi-tile">
        <p className="kpi-label">Anrop besvart denne måneden</p>
        <p className="kpi-value">{month.calls}</p>
        <p className="kpi-sub">{month.callsOutsideHours} utenfor åpningstid</p>
      </div>

      <div className="kpi-tile">
        <p className="kpi-label">Telefontid spart</p>
        <p className="kpi-value">{hours(month.callSeconds)}</p>
        <p className="kpi-sub">denne måneden · {hours(total.callSeconds)} siden oppstart</p>
      </div>

      {roiMultiple !== null && monthlyPriceNok !== null && (
        <div className="kpi-tile kpi-roi">
          <p className="kpi-label">Verdi mot abonnement</p>
          <p className="kpi-value">{roiMultiple.toLocaleString("no-NO")}×</p>
          <p className="kpi-sub">
            ~{nok(month.valueNok)} booket · abonnement {nok(monthlyPriceNok)}
          </p>
        </div>
      )}
    </div>
  );
}
