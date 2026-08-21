// Pure e-mail builder for shop notifications — no imports from the app, so a
// one-off script (or a live smoke test) can exercise the exact same subject
// and body that production sends, without dragging in Supabase/Blob config.

export type ShopNotification = {
  kind: "booking" | "note" | "reschedule" | "callback";
  /** For callback-kind this is when the CALL came in, not an appointment. */
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  customerName?: string;
  customerPhone: string;
  /** The service string as booked — includes car and reg.nr when collected. */
  service?: string;
  /** note-kind: the note text appended to the booking.
   *  callback-kind: what the caller wants someone to ring them back about. */
  note?: string;
  /** reschedule-kind only: where the booking moved from. */
  oldDate?: string;
  oldTime?: string;
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
          : `Notat på booking ${when}`);

  const rows: [string, string][] = [];
  if (n.kind === "callback") {
    rows.push(["Ringte", when]);
    if (n.customerName) rows.push(["Navn", n.customerName]);
    rows.push(["Telefon", n.customerPhone]);
    if (n.note) rows.push(["Beskjed", n.note]);
  } else if (n.kind === "reschedule" && n.oldDate && n.oldTime) {
    rows.push(["Flyttet fra", labelFor(n.oldDate, n.oldTime)]);
    rows.push(["Ny tid", when]);
  } else {
    rows.push(["Tidspunkt", when]);
  }
  if (n.kind !== "callback") {
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
          ? "En kunde ba om å snakke med en person. KI-resepsjonisten kan ikke sette over, så den tok imot beskjeden — ring kunden tilbake."
          : "KI-resepsjonisten har lagt et notat på en eksisterende booking.";

  const testWarning = test
    ? n.kind === "callback"
      ? "Dette er en TEST — ikke en ekte kunde. Den krever ingen handling."
      : "Dette er en TESTBOOKING fra testkalenderen — ikke en ekte kunde. Den krever ingen handling."
    : "";

  const text = [
    ...(testWarning ? [testWarning, ""] : []),
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
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
    <p>Alle detaljer og samtaleopptak finner dere i <a href="https://www.kiconsult.no/login">portalen</a>.</p>
    <p style="color:#888">— KI Consult, på vegne av ${escapeHtml(clientName)}</p>`;

  return { subject, html, text };
}
