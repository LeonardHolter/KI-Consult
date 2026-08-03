"use client";

import { useCallback, useEffect, useState } from "react";

// Toggle for the Chat-widget card on /portal/integrasjoner: decides whether
// this client's own dashboard loads the chat bubble. Reuses the ccm-* styles
// rendered by GoogleCalendarConnect on the same page, like TelnyxNumberConnect.

export default function ChatWidgetToggle({ clientId }: { clientId: string }) {
  const [show, setShow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/chat-widget?client=${clientId}`, { cache: "no-store" });
      if (!res.ok) return null;
      return Boolean((await res.json()).showChatWidget);
    } catch {
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    // The cancelled flag keeps a stale client's response from overwriting the
    // newly selected client's state.
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
      const res = await fetch("/api/portal/chat-widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, show: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kunne ikke lagre.");
      setShow(next);
      setStatus(
        next
          ? "Chatboten vises på kundens dashbord."
          : "Chatboten er skjult på kundens dashbord. Widgeten på nettsiden deres er upåvirket.",
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
          Vis chatboten
          <small>Kunden ser chatbobla når de logger inn</small>
        </button>
        <button
          type="button"
          className={show ? "" : "on"}
          disabled={busy}
          onClick={() => set(false)}
        >
          Skjul chatboten
          <small>Kun kalender og taleagent på dashbordet</small>
        </button>
      </div>
      {status && <p className="ccm-status">{status}</p>}
    </>
  );
}
