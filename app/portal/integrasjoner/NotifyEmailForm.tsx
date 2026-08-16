"use client";

import { useCallback, useEffect, useState } from "react";

// Form for the e-post card on /portal/integrasjoner: the shop's inbox for
// booking/message e-mails. Reuses the ccm-* styles rendered by
// GoogleCalendarConnect on the same page, like the other cards.

export default function NotifyEmailForm({ clientId }: { clientId: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchEmail = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/notify-email?client=${clientId}`, { cache: "no-store" });
      if (!res.ok) return null;
      return String((await res.json()).notificationEmail ?? "");
    } catch {
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    // cancelled keeps a stale client's response from overwriting the newly
    // selected client's value.
    let cancelled = false;
    fetchEmail().then((v) => {
      if (!cancelled) setEmail(v ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [fetchEmail]);

  async function save() {
    if (email === null) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/notify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Kunne ikke lagre.");
      setStatus(
        body.notificationEmail
          ? `Lagret. Bookinger og beskjeder sendes til ${body.notificationEmail}.`
          : "Lagret. Ingen e-poster sendes for denne kunden.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  if (email === null) return <p className="ccm-hint">Laster…</p>;

  return (
    <>
      <label className="ccm-label" htmlFor="notify-email">
        Verkstedets e-postadresse
      </label>
      <input
        id="notify-email"
        className="ccm-input"
        type="email"
        value={email}
        placeholder="f.eks. post@verkstedet.no"
        onChange={(e) => setEmail(e.target.value)}
      />
      <p className="ccm-hint">
        Hver booking, flytting og hvert notat fra agentene sendes hit. Tøm feltet og lagre for å
        skru av. Testbookinger fra testkalenderen merkes tydelig med [TEST].
      </p>
      <div className="ccm-actions">
        <button type="button" className="ccm-btn primary" onClick={save} disabled={busy}>
          {busy ? "Lagrer…" : "Lagre"}
        </button>
      </div>
      {status && <p className="ccm-status">{status}</p>}
    </>
  );
}
