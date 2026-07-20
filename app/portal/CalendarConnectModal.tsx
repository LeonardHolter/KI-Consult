"use client";

import { useEffect, useState } from "react";

type CalInfo = {
  serviceAccountEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  locationName: string;
  connected: boolean;
  voiceBookingMode: "sandbox" | "live";
};

export default function CalendarConnectModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [info, setInfo] = useState<CalInfo | null>(null);
  const [calendarIdInput, setCalendarIdInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/calendar?client=${clientId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CalInfo) => {
        setInfo(d);
        setCalendarIdInput(d.calendarId ?? "");
      });
  }, [clientId]);

  async function refresh() {
    const d = (await (await fetch(`/api/portal/calendar?client=${clientId}`, { cache: "no-store" })).json()) as CalInfo;
    setInfo(d);
    return d;
  }

  async function connect() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, calendarId: calendarIdInput }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Tilkobling feilet");
      await refresh();
      setStatus(`✓ Tilkoblet kalenderen «${body.calendarName}». Kalenderen styrer nå ledige timer og mottar bookinger.`);
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
      const res = await fetch("/api/portal/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, disconnect: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kunne ikke koble fra");
      await refresh();
      setCalendarIdInput("");
      setStatus("Kalenderen er koblet fra. Bookinger går nå til testmodus (demo-kalender).");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  async function setVoiceMode(mode: "sandbox" | "live") {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, voiceBookingMode: mode }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kunne ikke endre modus");
      await refresh();
      setStatus(
        mode === "live"
          ? "⚠ Stemmeagenten booker nå i den EKTE kalenderen — på lik linje med chatboten."
          : "Stemmeagenten booker nå i testkalenderen. Ingenting havner i den ekte kalenderen.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  async function copyEmail() {
    if (!info?.serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(info.serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — email is still visible to select manually */
    }
  }

  return (
    <div className="ccm-backdrop" onClick={onClose}>
      <style>{`
        .ccm-backdrop { position: fixed; inset: 0; background: rgba(22,25,15,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .ccm { background: #fff; border-radius: 14px; padding: 28px; width: 100%; max-width: 480px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,.25); position: relative; }
        .ccm-close { position: absolute; top: 14px; right: 14px; border: 0; background: #f3efe4; color: #16190f; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 15px; line-height: 1; }
        .ccm h2 { margin: 0 0 18px; font-size: 1.2rem; letter-spacing: -.02em; display: flex; align-items: center; gap: 8px; }
        .ccm-banner { background: #e4f7ee; color: #0d6b47; border-radius: 10px; padding: 12px 14px; font-size: 13.5px; margin-bottom: 16px; }
        .ccm-label { display: block; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9a8c; margin: 16px 0 6px; }
        .ccm-sharebox { display: flex; align-items: center; gap: 8px; background: #faf8f1; border: 1px solid rgba(154,154,140,.4); border-radius: 8px; padding: 8px 10px; }
        .ccm-sharebox code { flex: 1; font-size: 12.5px; word-break: break-all; }
        .ccm-sharebox button { flex-shrink: 0; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 7px; border: 1px solid rgba(154,154,140,.4); background: #fff; cursor: pointer; }
        .ccm-hint { font-size: 12.5px; color: #5c5f52; line-height: 1.5; margin: 8px 0 0; }
        .ccm-input { width: 100%; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; padding: 9px 11px; font-size: 13.5px; font-family: inherit; }
        .ccm-actions { display: flex; gap: 10px; margin-top: 18px; }
        .ccm-btn { padding: 9px 16px; border-radius: 9px; font-size: 13.5px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; }
        .ccm-btn.primary { background: #15c07c; color: #08231a; }
        .ccm-btn.primary:disabled { opacity: .5; cursor: default; }
        .ccm-btn.ghost { background: #f3efe4; color: #16190f; border: 1px solid rgba(154,154,140,.4); }
        .ccm-status { margin-top: 12px; font-size: 13px; color: #3d4034; }
        .ccm-divider { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid rgba(154,154,140,.3); }
        .ccm-seg { display: flex; gap: 8px; margin-top: 8px; }
        .ccm-seg button { flex: 1; padding: 9px 10px; border-radius: 9px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid rgba(154,154,140,.4); background: #fff; color: #16190f; text-align: left; line-height: 1.35; }
        .ccm-seg button small { display: block; font-weight: 400; color: #9a9a8c; font-size: 11px; margin-top: 2px; }
        .ccm-seg button.on { border-color: #15c07c; background: #e4f7ee; color: #0d6b47; }
        .ccm-seg button.on.warn { border-color: #e08475; background: #fdf0ed; color: #c0392b; }
        .ccm-seg button.on small { color: inherit; opacity: .8; }
        .ccm-seg button:disabled { opacity: .55; cursor: default; }
      `}</style>
      <div className="ccm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Google Calendar-integrasjon">
        <button className="ccm-close" aria-label="Lukk" onClick={onClose}>✕</button>
        <h2>📅 Google Calendar-integrasjon</h2>

        {!info ? (
          <p className="ccm-hint">Laster…</p>
        ) : (
          <>
            {info.connected && (
              <p className="ccm-banner">
                ✓ Tilkoblet: <strong>{info.calendarName ?? info.calendarId}</strong> — agenten leser ledige
                timer fra og booker rett i denne kalenderen.
              </p>
            )}

            {!info.serviceAccountEmail ? (
              <p className="ccm-hint">
                Serveren mangler GOOGLE_SERVICE_ACCOUNT_KEY. Legg til service-konto-nøkkelen i
                miljøvariablene først.
              </p>
            ) : (
              <>
                <label className="ccm-label">Steg 1 — del butikkens kalender med denne kontoen</label>
                <div className="ccm-sharebox">
                  <code>{info.serviceAccountEmail}</code>
                  <button type="button" onClick={copyEmail}>{copied ? "Kopiert!" : "Kopier"}</button>
                </div>
                <p className="ccm-hint">
                  I Google Calendar: Innstillinger → velg bookingkalenderen → «Del med bestemte personer»
                  → lim inn adressen over → velg tilgangen <strong>«Gjør endringer i aktiviteter»</strong>.
                </p>

                <label className="ccm-label">Steg 2 — lim inn kalender-ID-en</label>
                <input
                  className="ccm-input"
                  value={calendarIdInput}
                  onChange={(e) => setCalendarIdInput(e.target.value)}
                  placeholder="f.eks. strommen@handzon.no eller …@group.calendar.google.com"
                />
                <p className="ccm-hint">
                  Kalenderens innstillingsside → «Integrer kalenderen» → Kalender-ID. For en hovedkalender
                  er ID-en kontoens e-postadresse.
                </p>

                <div className="ccm-actions">
                  <button type="button" className="ccm-btn primary" onClick={connect} disabled={busy || !calendarIdInput.trim()}>
                    {busy ? "Kobler til…" : "Koble til / test tilgang"}
                  </button>
                  {info.connected && (
                    <button type="button" className="ccm-btn ghost" onClick={disconnect} disabled={busy}>
                      Koble fra
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Voice booking target. Lives outside the service-account branch
                on purpose: sandbox needs no Google credentials at all. */}
            <div className="ccm-divider">
              <label className="ccm-label">Stemmeagentens bookinger</label>
              <div className="ccm-seg">
                <button
                  type="button"
                  className={info.voiceBookingMode === "sandbox" ? "on" : ""}
                  onClick={() => setVoiceMode("sandbox")}
                  disabled={busy || info.voiceBookingMode === "sandbox"}
                >
                  Testkalender
                  <small>Trygt å teste — rører aldri Google</small>
                </button>
                <button
                  type="button"
                  className={info.voiceBookingMode === "live" ? "on warn" : ""}
                  onClick={() => setVoiceMode("live")}
                  disabled={busy || info.voiceBookingMode === "live"}
                >
                  Ekte kalender
                  <small>Samme som chatboten</small>
                </button>
              </div>
              <p className="ccm-hint">
                {info.voiceBookingMode === "live"
                  ? "Stemmeagenten booker i den ekte kalenderen. Alt den booker er en reell avtale."
                  : "Stemmeagenten booker i en egen testkalender. Bruk denne til å prøve ut bookingflyten før du slipper den løs på den ekte kalenderen."}
              </p>
            </div>

            {status && <p className="ccm-status">{status}</p>}
          </>
        )}
      </div>
    </div>
  );
}
