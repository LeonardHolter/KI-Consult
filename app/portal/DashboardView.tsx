"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import VoiceAgentCard from "@/components/VoiceAgentCard";

/**
 * The client-facing view of their bot: the live booking calendar plus the chat
 * widget itself, so the owner can both watch bookings land and talk to the bot
 * exactly as a customer would.
 *
 * Calendar data comes through /api/bot/* rather than the bot's origin directly,
 * so the session decides which client's calendar is returned. The chat widget
 * is the real embed script from the bot's deployment — not a copy — so what the
 * owner tests here is byte-for-byte what their customers get.
 */

type Booking = {
  customerName?: string;
  customerPhone?: string;
  service?: string;
  bookedAt?: string;
};

type Slot = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  location: string;
  capacity: number;
  serviceKeyword?: string;
  bookings: Booking[];
  bookedCount: number;
  full: boolean;
};

const WEEKDAYS = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function serviceStyle(service?: string): { className: string } {
  const s = (service ?? "").toLowerCase();
  if (s.includes("vask")) return { className: "svc-wash" };
  if (s.includes("poler")) return { className: "svc-polish" };
  if (s.includes("hjul") || s.includes("dekk")) return { className: "svc-tires" };
  if (s.includes("inter")) return { className: "svc-interior" };
  if (s.includes("lakk") || s.includes("foli") || s.includes("ppf")) return { className: "svc-coating" };
  return { className: "svc-other" };
}

type RowKey = { time: string; endTime: string; serviceKeyword?: string };
type SelectedBooking = {
  booking: Booking;
  date: string;
  time: string;
  endTime: string;
  serviceKeyword?: string;
};

function fmtDate(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function fmtBookedAt(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("no-NO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/** Origin of the bot deployment, used to load its chat widget. */
const BOT_ORIGIN =
  process.env.NEXT_PUBLIC_BOT_ORIGIN ?? "https://handzon-voice-demo.vercel.app";

export default function PortalDashboard({
  clientId,
  clientLabel,
  samtalerHref = "/portal/samtaler",
  overviewHref,
}: {
  /** Set only when an admin is viewing a specific client; omitted for a client
   *  account, which the /api/bot proxy pins to its own client regardless. */
  clientId?: string;
  /** Shown next to the brand when an admin is viewing someone else's dashboard. */
  clientLabel?: string;
  samtalerHref?: string;
  /** Present only for the admin drill-down — link back to the client list. */
  overviewHref?: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [calConnected, setCalConnected] = useState(false);
  const [calName, setCalName] = useState<string | undefined>(undefined);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selected, setSelected] = useState<SelectedBooking | null>(null);

  // Load the bot's real embed script so the chat here is the same widget the
  // customers use. It self-injects a bubble into document.body.
  useEffect(() => {
    if (document.getElementById("bot-embed")) return;
    const s = document.createElement("script");
    s.id = "bot-embed";
    s.src = `${BOT_ORIGIN}/embed.js`;
    s.async = true;
    document.body.appendChild(s);
    return () => {
      // The widget mounts outside React, so unmounting the page has to take the
      // bubble down too — otherwise it follows the user onto other pages.
      document.getElementById("handzon-chat-root")?.remove();
      s.remove();
      // embed.js guards its IIFE with this flag so a static <script> tag on a
      // real website never double-inits. We remove and re-insert the tag on
      // every mount/unmount here, so without clearing the flag, the
      // re-executed script sees it already set, returns immediately, and
      // never rebuilds the DOM we just tore down — no bubble on the next
      // visit to this page within the same tab (e.g. log out, log back in).
      delete (window as unknown as Record<string, unknown>).__handzonChatLoaded;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const url = clientId
          ? `/api/bot/calendar-view?client=${clientId}`
          : "/api/bot/calendar-view";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        setSlots(d.slots ?? []);
        setCalConnected(Boolean(d.connected));
        setCalName(d.calendarName);
        setLastSync(new Date());
      } catch {
        /* keep last known state */
      }
    }
    poll();
    const iv = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // Re-poll on clientId change: an admin switching clients keeps this same
    // component mounted (only the ?client= search param changes), so without
    // this dependency the interval would keep polling the previous client.
  }, [clientId]);

  const days = useMemo(() => [...new Set(slots.map((s) => s.date))].sort(), [slots]);

  // One row per distinct time/service template, derived from the data rather
  // than from a fixed clock, so rows grow with their bookings instead of
  // overlapping.
  const rows = useMemo(() => {
    const map = new Map<string, RowKey>();
    for (const s of slots) {
      const key = `${s.time}-${s.endTime}`;
      if (!map.has(key)) map.set(key, { time: s.time, endTime: s.endTime, serviceKeyword: s.serviceKeyword });
    }
    return [...map.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [slots]);

  const slotAt = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slots) map.set(`${s.date}|${s.time}|${s.endTime}`, s);
    return map;
  }, [slots]);

  return (
    <div className="ctp">
      <style>{`
        /* KI Consult palette: cream page, ink text, green accents. */
        .ctp {
          min-height: 100vh; background: #f3efe4; color: #16190f;
          font-family: var(--font-schibsted), system-ui, sans-serif;
        }
        .ctp-bar {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 16px 24px; background: #fff; border-bottom: 1px solid rgba(154,154,140,.27);
        }
        .ctp-brand { font-weight: 800; font-size: 19px; letter-spacing: -.03em; }
        .ctp-brand span { color: #15A06A; }
        .ctp-back {
          padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(154,154,140,.4);
          background: #f3efe4; color: #16190f; text-decoration: none; font-size: 14px; font-weight: 600;
        }
        .ctp-back:hover { background: #efede2; }
        .ctp-live {
          margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
          background: #e4f7ee; color: #0d6b47; border-radius: 999px;
          padding: 7px 14px; font-size: .82rem; font-weight: 700;
        }
        .ctp-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #15c07c;
          animation: ctp-pulse 2s ease-in-out infinite;
        }
        @keyframes ctp-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .ctp-live em { font-style: normal; color: #4a7a63; font-weight: 400; margin-left: 2px; }

        .ctp-main { padding: 26px 24px 60px; max-width: 1240px; margin: 0 auto; }
        .ctp-title { font-size: 26px; letter-spacing: -.02em; margin: 0 0 4px; }
        .ctp-sub { color: #9a9a8c; font-size: 14px; margin: 0 0 22px; }

        .ctp-card { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 14px; overflow: hidden; }
        .ctp-card-head {
          padding: 18px 22px; border-bottom: 1px solid rgba(154,154,140,.22);
          display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
        }
        .ctp-card-head h2 { margin: 0; font-size: 1.05rem; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }
        .ctp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-left: auto; font-size: .8rem; color: #9a9a8c; }
        .ctp-sync { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px; font-weight: 700; }
        .ctp-sync.is-on { background: #e4f7ee; color: #0d6b47; }
        .ctp-sync.is-off { background: #efede2; color: #9a9a8c; }
        .ctp-legend { display: flex; flex-wrap: wrap; gap: 6px; }
        .ctp-legend-item { padding: 3px 10px; border-radius: 999px; font-size: .72rem; font-weight: 700; background: var(--svc-bg); color: var(--svc); }

        .ctp-scroll { overflow-x: auto; }
        table.ctp-table { border-collapse: collapse; width: 100%; min-width: 900px; }
        .ctp-table th, .ctp-table td {
          border-bottom: 1px solid rgba(154,154,140,.22);
          border-right: 1px solid rgba(154,154,140,.22);
          padding: 8px 10px; vertical-align: top;
        }
        .ctp-table th:last-child, .ctp-table td:last-child { border-right: none; }
        .ctp-table thead th { position: sticky; top: 0; background: #fff; z-index: 2; text-align: center; padding: 12px 10px; }
        .ctp-daynum { display: block; font-size: 1.3rem; font-weight: 800; color: #16190f; }
        .ctp-wd { display: block; font-size: .7rem; color: #9a9a8c; text-transform: uppercase; letter-spacing: .05em; }
        .ctp-month { display: block; font-size: .7rem; color: #9a9a8c; }
        .ctp-rowlabel {
          position: sticky; left: 0; background: #faf8f1; z-index: 1;
          font-size: .77rem; font-weight: 700; color: #3d4034; white-space: nowrap; min-width: 110px;
        }
        .ctp-rowlabel small { display: block; font-weight: 400; color: #9a9a8c; font-size: .67rem; }
        .ctp-cell { min-width: 120px; }
        .ctp-empty-cell { color: #cfcdc0; text-align: center; }
        .ctp-chips { display: flex; flex-direction: column; gap: 4px; }
        .ctp-chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: .73rem; font-weight: 700; line-height: 1.3;
          padding: 3px 9px; border-radius: 8px; width: fit-content; max-width: 100%;
          border: 0; font-family: inherit;
        }
        .ctp-chip.is-booked { background: var(--svc-bg); color: var(--svc); cursor: pointer; transition: filter .15s; }
        .ctp-chip.is-booked:hover { filter: brightness(.94); }
        .ctp-chip.is-booked:focus-visible { outline: 2px solid var(--svc); outline-offset: 1px; }
        .ctp-chip.is-free { background: #f3efe4; color: #9a9a8c; font-weight: 500; }

        .ctp-loading { padding: 40px; text-align: center; color: #9a9a8c; }
        .ctp-hint {
          margin: 18px 0 0; padding: 13px 16px; background: #fff;
          border: 1px solid rgba(154,154,140,.27); border-radius: 12px;
          color: #3d4034; font-size: 13.5px; line-height: 1.55;
        }
        .ctp-hint b { color: #16190f; }

        /* Service colours, kept distinguishable rather than forced to brand green. */
        .svc-wash { --svc: #1a73e8; --svc-bg: #e8f0fe; }
        .svc-polish { --svc: #12839b; --svc-bg: #e0f4f8; }
        .svc-tires { --svc: #b35c00; --svc-bg: #fdf0dd; }
        .svc-interior { --svc: #8430ce; --svc-bg: #f3e8fd; }
        .svc-coating { --svc: #0d6b47; --svc-bg: #e4f7ee; }
        .svc-other { --svc: #08231a; --svc-bg: #e7e5da; }

        .ctp-modal-backdrop {
          position: fixed; inset: 0; background: rgba(22,25,15,.45);
          display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
        }
        .ctp-modal {
          background: #fff; border-radius: 14px; padding: 28px; width: 100%; max-width: 380px;
          box-shadow: 0 20px 50px rgba(0,0,0,.25); position: relative;
        }
        .ctp-modal-close {
          position: absolute; top: 14px; right: 14px; border: 0; background: #f3efe4; color: #16190f;
          width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 15px; line-height: 1;
        }
        .ctp-modal-close:hover { background: #efede2; }
        .ctp-modal h3 { margin: 12px 0 16px; font-size: 1.25rem; letter-spacing: -.02em; }
        .ctp-modal-fields { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; }
        .ctp-modal-fields dt { font-size: .72rem; font-weight: 700; color: #9a9a8c; text-transform: uppercase; letter-spacing: .04em; align-self: center; }
        .ctp-modal-fields dd { margin: 0; font-size: .92rem; color: #16190f; }
        .ctp-modal-fields a { color: #0d6b47; text-decoration: none; font-weight: 700; }
        .ctp-modal-fields a:hover { text-decoration: underline; }
      `}</style>

      <div className="ctp-bar">
        <span className="ctp-brand">
          KI&nbsp;Consult<span>.no</span>
        </span>
        {overviewHref && (
          <Link href={overviewHref} className="ctp-back">
            ‹ Alle kunder
          </Link>
        )}
        {clientLabel && (
          <span style={{ color: "#9a9a8c", fontSize: 14, fontWeight: 600 }}>
            {clientLabel}
          </span>
        )}
        <Link href={samtalerHref} className="ctp-back">
          Samtaler ›
        </Link>
        {overviewHref && (
          <Link href={`/portal/voice-demo${clientId ? `?client=${clientId}` : ""}`} className="ctp-back">
            Juster agenten
          </Link>
        )}
        <span className="ctp-live">
          <span className="ctp-dot" /> LIVE
          {lastSync && <em>oppdatert {lastSync.toLocaleTimeString("no-NO")}</em>}
        </span>
        <form action={signOut}>
          <button className="ctp-back" style={{ fontFamily: "inherit", cursor: "pointer" }}>
            Logg ut
          </button>
        </form>
      </div>

      <div className="ctp-main">
        <h1 className="ctp-title">Bookingkalender</h1>
        <p className="ctp-sub">
          Kalenderen speiler Google Calendar i sanntid. Chat med boten nede til
          høyre — det er nøyaktig samme bot som kundene dine snakker med.
        </p>

        <VoiceAgentCard clientId={clientId} />
        <div style={{ height: 20 }} />

        <div className="ctp-card">
          <div className="ctp-card-head">
            <h2>Ledige tider</h2>
            <div className="ctp-meta">
              <span>{slots[0]?.location ?? "Strømmen Senter"}</span>
              <span className={`ctp-sync ${calConnected ? "is-on" : "is-off"}`}>
                {calConnected
                  ? `Synkronisert${calName ? `: ${calName.trim()}` : ""}`
                  : "Demo-modus"}
              </span>
              <div className="ctp-legend">
                <span className="ctp-legend-item svc-wash">Bilvask</span>
                <span className="ctp-legend-item svc-polish">Polering</span>
                <span className="ctp-legend-item svc-tires">Dekk &amp; felg</span>
                <span className="ctp-legend-item svc-interior">Interiør</span>
                <span className="ctp-legend-item svc-coating">Lakk &amp; folie</span>
                <span className="ctp-legend-item svc-other">Annet</span>
              </div>
            </div>
          </div>

          {days.length === 0 ? (
            <p className="ctp-loading">Laster kalender…</p>
          ) : (
            <div className="ctp-scroll">
              <table className="ctp-table">
                <thead>
                  <tr>
                    <th />
                    {days.map((date) => {
                      const d = new Date(`${date}T12:00:00`);
                      return (
                        <th key={date}>
                          <span className="ctp-wd">{WEEKDAYS[d.getDay()]}</span>
                          <span className="ctp-daynum">{d.getDate()}</span>
                          <span className="ctp-month">{MONTHS[d.getMonth()]}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.time}-${row.endTime}`}>
                      <td className="ctp-rowlabel">
                        {row.time}–{row.endTime}
                        {row.serviceKeyword && <small>kun {row.serviceKeyword}</small>}
                      </td>
                      {days.map((date) => {
                        const s = slotAt.get(`${date}|${row.time}|${row.endTime}`);
                        if (!s) {
                          return (
                            <td key={date} className="ctp-cell ctp-empty-cell">
                              —
                            </td>
                          );
                        }
                        const openSpots = s.capacity - s.bookedCount;
                        return (
                          <td key={date} className="ctp-cell">
                            <div className="ctp-chips">
                              {s.bookings.map((b, i) => {
                                const svc = serviceStyle(b.service);
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    className={`ctp-chip is-booked ${svc.className}`}
                                    title="Klikk for navn og detaljer"
                                    onClick={() =>
                                      setSelected({
                                        booking: b,
                                        date,
                                        time: s.time,
                                        endTime: s.endTime,
                                        serviceKeyword: s.serviceKeyword,
                                      })
                                    }
                                  >
                                    {b.service || "Booket"}
                                  </button>
                                );
                              })}
                              {openSpots > 0 && (
                                <span className="ctp-chip is-free">
                                  {openSpots} ledig{openSpots > 1 ? "e" : ""} plass
                                  {openSpots > 1 ? "er" : ""}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="ctp-hint">
          <b>Tips:</b> book en time i chatten, så dukker den opp i kalenderen her
          i løpet av sekunder — akkurat slik den gjør når en ekte kunde booker.
        </p>
      </div>

      {selected && (
        <div className="ctp-modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="ctp-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Bookingdetaljer"
          >
            <button className="ctp-modal-close" aria-label="Lukk" onClick={() => setSelected(null)}>
              ✕
            </button>
            <span className={`ctp-legend-item ${serviceStyle(selected.booking.service).className}`}>
              {selected.booking.service || "Booking"}
            </span>
            <h3>{selected.booking.customerName || "Ukjent kunde"}</h3>
            <dl className="ctp-modal-fields">
              {selected.booking.customerPhone && (
                <>
                  <dt>Telefon</dt>
                  <dd>
                    <a href={`tel:${selected.booking.customerPhone.replace(/\s/g, "")}`}>
                      {selected.booking.customerPhone}
                    </a>
                  </dd>
                </>
              )}
              <dt>Tid</dt>
              <dd>
                {fmtDate(selected.date)}, {selected.time}–{selected.endTime}
                {selected.serviceKeyword ? ` (kun ${selected.serviceKeyword})` : ""}
              </dd>
              {fmtBookedAt(selected.booking.bookedAt) && (
                <>
                  <dt>Booket</dt>
                  <dd>{fmtBookedAt(selected.booking.bookedAt)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
