"use client";

import { useCallback, useEffect, useState } from "react";

// Connect flow for the Telefonnummer card on /portal/integrasjoner: pick a
// number that already exists on the Telnyx account and wire it to this
// client's voice agent. Buying numbers stays in the Telnyx portal — this is
// the wiring, not the shopping. Reuses the ccm-* styles rendered by
// GoogleCalendarConnect on the same page.

type NumberRow = {
  phoneNumber: string;
  status: string;
  connectionName: string | null;
  assignedClientId: string | null;
  assignedClientName: string | null;
};

type NumbersInfo = {
  configured: boolean;
  assignedNumber: string | null;
  numbers: NumberRow[];
  error?: string;
};

/** "4732994223" -> "+47 32 99 42 23"-ish for display; leaves odd lengths alone. */
function prettyNumber(digits: string | null): string {
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("47")) {
    const n = digits.slice(2);
    return `+47 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
  }
  return `+${digits}`;
}

export default function TelnyxNumberConnect({ clientId }: { clientId: string }) {
  const [info, setInfo] = useState<NumbersInfo | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/telephony/numbers?client=${clientId}`, { cache: "no-store" });
      const d = (await res.json()) as NumbersInfo;
      setInfo(
        res.ok
          ? d
          : { configured: true, assignedNumber: null, numbers: [], error: d.error ?? "Kunne ikke hente numre." },
      );
    } catch {
      setInfo({ configured: true, assignedNumber: null, numbers: [], error: "Kunne ikke hente numre." });
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/telephony/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, number: selected }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Tilkobling feilet");
      await refresh();
      setStatus(
        `✓ ${prettyNumber(body.assignedNumber)} er koblet til denne kunden. ${body.note ?? ""}${body.connectionWarning ? ` ⚠ ${body.connectionWarning}` : ""}`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/telephony/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, disconnect: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kunne ikke koble fra");
      await refresh();
      setStatus("Nummeret er koblet fra. Samtaler til det rutes ikke lenger til denne kunden.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <p className="ccm-hint">Laster numre fra Telnyx…</p>;
  if (!info.configured) {
    return <p className="ccm-hint">Serveren mangler TELNYX_API_KEY — legg den til i miljøvariablene først.</p>;
  }
  if (info.error) return <p className="ccm-hint">{info.error}</p>;

  const available = info.numbers.filter(
    (n) => !n.assignedClientId || n.assignedClientId === clientId,
  );

  return (
    <>
      {info.assignedNumber && (
        <p className="ccm-banner">
          ✓ Tilkoblet: <strong>{prettyNumber(info.assignedNumber)}</strong> — samtaler besvares av
          denne kundens taleagent, tas opp og havner i Samtaleopptak-panelet.
        </p>
      )}

      <label className="ccm-label">
        {info.assignedNumber ? "Bytt nummer" : "Velg et nummer fra Telnyx-kontoen"}
      </label>
      <select
        className="ccm-input"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Velg nummer…</option>
        {info.numbers.map((n) => {
          const takenByOther = Boolean(n.assignedClientId) && n.assignedClientId !== clientId;
          return (
            <option key={n.phoneNumber} value={n.phoneNumber} disabled={takenByOther}>
              {n.phoneNumber}
              {takenByOther ? ` — i bruk av ${n.assignedClientName}` : ""}
              {n.assignedClientId === clientId ? " — koblet hit" : ""}
            </option>
          );
        })}
      </select>
      <p className="ccm-hint">
        Lista er numrene som finnes på Telnyx-kontoen. Trenger kunden et nytt nummer, kjøpes det i
        Telnyx-portalen først — så dukker det opp her. Tilkoblingen peker nummeret på taleagentens
        oppsett automatisk, og rutingen er aktiv innen ett minutt.
      </p>

      <div className="ccm-actions">
        <button
          type="button"
          className="ccm-btn primary"
          onClick={connect}
          disabled={busy || !selected || available.every((n) => n.phoneNumber !== selected)}
        >
          {busy ? "Kobler til…" : "Koble til nummer"}
        </button>
        {info.assignedNumber && (
          <button type="button" className="ccm-btn ghost" onClick={disconnect} disabled={busy}>
            Koble fra
          </button>
        )}
      </div>

      {status && <p className="ccm-status">{status}</p>}
    </>
  );
}
