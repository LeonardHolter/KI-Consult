// The title of a booking as it appears in the shop's Google Calendar.
//
// Sabah's ask (2026-08-21): everything he needs must be readable in the
// calendar grid itself — he was opening every event just to find the phone
// number. So the order is his: who, how to reach them, which car, what for.
//
// The car comes out of the service string rather than a field of its own,
// because that is where both the chat and voice prompts write it
// («Vask utvendig Basic — VW Golf, AB 12345»). parseService already knows
// how to take it apart, and anything it cannot find is simply left out —
// never guessed, and never rendered as an empty separator.

import { parseService } from "@/lib/customers";

/** "+4798361774" -> "98 36 17 74". Norwegian eight-digit numbers are shown
 *  in the pairs people read them in; anything else is left alone, since a
 *  foreign number regrouped by a Norwegian rule is harder to dial, not
 *  easier. */
export function shortPhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 10 && digits.startsWith("47") ? digits.slice(2) : digits;
  if (local.length !== 8) return raw.trim();
  return `${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6)}`;
}

/**
 * Navn · telefon · skilt (ellers bil) · tjeneste
 *
 * The plate wins over make and model when both are known: it identifies the
 * exact car in the yard, which is what the title is for. Make and model are
 * the fallback for a booking taken without a plate.
 */
export function calendarEventTitle(booking: {
  customerName?: string;
  customerPhone?: string;
  service?: string;
}): string {
  // Extras the agent appended after the booking («… + ønsker vurdering av
  // PDR») are split off first: parseService drops them along with the car,
  // and losing them here would put the one thing the shop has to remember
  // back behind a click — which is the whole complaint this title fixes.
  const [booked, ...extras] = (booking.service ?? "").split(/\s\+\s/);
  const { service, car, regNr } = parseService(booked);
  const parts = [
    booking.customerName?.trim(),
    shortPhone(booking.customerPhone),
    regNr || car,
    service,
    ...extras.map((e) => `+ ${e.trim()}`),
  ].filter((p): p is string => Boolean(p && p.trim()));

  // A booking with nothing filled in still needs a title Google will accept.
  return parts.length ? parts.join(" · ") : "Booking";
}
