// Pure e-mail builder for shop notifications — no imports from the app, so a
// one-off script (or a live smoke test) can exercise the exact same subject
// and body that production sends, without dragging in Supabase/Blob config.

export type ShopNotification = {
  kind: "booking" | "note" | "reschedule" | "callback" | "transcript";
  /** For callback-kind this is when the CALL came in, not an appointment. */
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  customerName?: string;
  customerPhone: string;
  /** callback-kind: collected only by agents whose prompt asks for it (an
   *  intake agent that hands the whole request to a service desk). */
  customerEmail?: string;
  /** callback-kind: «merke modell, reg.nr» when the caller gave it. */
  vehicle?: string;
  /** The service string as booked — includes car and reg.nr when collected. */
  service?: string;
  /** note-kind: the note text appended to the booking.
   *  callback-kind: what the caller wants someone to ring them back about. */
  note?: string;
  /** reschedule-kind only: where the booking moved from. */
  oldDate?: string;
  oldTime?: string;
  /** transcript-kind: the finished conversation, one line per turn, already
   *  formatted by lib/telephony/postCall.ts. Only ever set post-call — the
   *  summary mail goes out mid-call, when no full transcript exists yet. */
  transcript?: string[];
  /** transcript-kind: how long the call lasted, in seconds. */
  durationSecs?: number;
  /** Sandbox bookings are test traffic and must never read as real customers. */
  scope: "live" | "sandbox";
};

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

/** "2026-08-24" + "08:00" -> "mandag 24. august kl. 08:00". Noon-anchored so
 *  the runner's timezone can't shift the weekday. */
export function labelFor(date: string, time: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} kl. ${time}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildShopEmail(
  clientName: string,
  n: ShopNotification,
): { subject: string; html: string; text: string } {
  const when = labelFor(n.date, n.time);
  const test = n.scope === "sandbox";

  const subject =
    (test ? "[TEST] " : "") +
    (n.kind === "booking"
      ? `Ny booking: ${when}`
      : n.kind === "reschedule"
        ? `Booking flyttet til ${when}`
        : n.kind === "callback"
          ? // The one notification that is a to-do rather than a record: a
            // customer is waiting for a call back, so the phone number
            // belongs in the subject line where it can be acted on from a
            // phone's lock screen.
            `Ønsker å bli oppringt: ${n.customerPhone}`
          : n.kind === "transcript"
            ? n.note
              ? // Carrying the enquiry makes this the only mail for the call,
                // so it has to read as the to-do the callback subject was —
                // phone number first, actionable from a lock screen.
                `Ønsker å bli oppringt: ${n.customerPhone}`
              : // Transcript only: the enquiry went out separately. Echoes
                // that subject's number so the two land together in an inbox
                // sorted by time.
                `Samtale med ${n.customerPhone} — hele samtalen`
            : `Notat på booking ${when}`);

  const rows: [string, string][] = [];
  if (n.kind === "transcript") {
    rows.push(["Ringte", when]);
    if (n.customerName) rows.push(["Navn", n.customerName]);
    rows.push(["Telefon", n.customerPhone]);
    if (n.customerEmail) rows.push(["E-post", n.customerEmail]);
    if (n.vehicle) rows.push(["Bil", n.vehicle]);
    if (n.note) rows.push(["Beskjed", n.note]);
    if (n.durationSecs !== undefined) {
      const m = Math.floor(n.durationSecs / 60);
      const s = n.durationSecs % 60;
      rows.push(["Varighet", m ? `${m} min ${s} sek` : `${s} sek`]);
    }
  } else if (n.kind === "callback") {
    rows.push(["Ringte", when]);
    if (n.customerName) rows.push(["Navn", n.customerName]);
    rows.push(["Telefon", n.customerPhone]);
    if (n.customerEmail) rows.push(["E-post", n.customerEmail]);
    if (n.vehicle) rows.push(["Bil", n.vehicle]);
    if (n.note) rows.push(["Beskjed", n.note]);
  } else if (n.kind === "reschedule" && n.oldDate && n.oldTime) {
    rows.push(["Flyttet fra", labelFor(n.oldDate, n.oldTime)]);
    rows.push(["Ny tid", when]);
  } else {
    rows.push(["Tidspunkt", when]);
  }
  if (n.kind !== "callback" && n.kind !== "transcript") {
    if (n.service) rows.push(["Tjeneste", n.service]);
    if (n.customerName) rows.push(["Kunde", n.customerName]);
    rows.push(["Telefon", n.customerPhone]);
    if (n.kind === "note" && n.note) rows.push(["Notat", n.note]);
  }

  const intro =
    n.kind === "booking"
      ? "KI-resepsjonisten har lagt inn en ny booking."
      : n.kind === "reschedule"
        ? "KI-resepsjonisten har flyttet en eksisterende booking."
        : n.kind === "callback"
          ? "KI-resepsjonisten tok imot en henvendelse som trenger oppfølging fra dere — ring kunden tilbake."
          : n.kind === "transcript"
            ? n.note
              ? "KI-resepsjonisten tok imot en henvendelse som trenger oppfølging fra dere — ring kunden tilbake. Hele samtalen står nederst."
              : "Her er hele samtalen, ord for ord. Selve henvendelsen er allerede sendt i en egen e-post."
            : "KI-resepsjonisten har lagt et notat på en eksisterende booking.";

  const testWarning = test
    ? n.kind === "callback"
      ? "Dette er en TEST — ikke en ekte kunde. Den krever ingen handling."
      : "Dette er en TESTBOOKING fra testkalenderen — ikke en ekte kunde. Den krever ingen handling."
    : "";

  const lines = n.kind === "transcript" ? (n.transcript ?? []) : [];

  const text = [
    ...(testWarning ? [testWarning, ""] : []),
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(lines.length ? ["", "--- SAMTALEN ---", ...lines] : []),
    "",
    `Alle detaljer og samtaleopptak: https://www.kiconsult.no/login`,
    "",
    `— KI Consult, på vegne av ${clientName}`,
  ].join("\n");

  const html = `
    ${test ? `<p style="background:#fdf4e3;color:#a35a00;padding:10px 14px;border-radius:8px"><strong>${escapeHtml(testWarning)}</strong></p>` : ""}
    <p>${escapeHtml(intro)}</p>
    <table cellpadding="6" style="border-collapse:collapse">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="color:#666;padding-right:14px">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`,
        )
        .join("\n      ")}
    </table>
    ${
      lines.length
        ? `<h3 style="margin:22px 0 8px;font-size:15px">Samtalen</h3>
    <div style="border-left:3px solid #15c07c;padding-left:14px">
      ${lines
        // The caller's own words are the ones an adviser scans for, so they
        // carry the weight; the agent's turns stay grey and recede.
        .map((l) => {
          const isCustomer = /^(\[\d{2}:\d{2}\]\s*)?Kunde:/.test(l);
          return `<p style="margin:0 0 6px;line-height:1.45;color:${isCustomer ? "#16190f" : "#6b6b6b"}">${escapeHtml(l)}</p>`;
        })
        .join("\n      ")}
    </div>`
        : ""
    }
    <p>Alle detaljer og samtaleopptak finner dere i <a href="https://www.kiconsult.no/login">portalen</a>.</p>
    <p style="color:#888">— KI Consult, på vegne av ${escapeHtml(clientName)}</p>`;

  return { subject, html, text };
}
