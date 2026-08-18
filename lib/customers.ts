// The customer list: every person the agent has booked, grouped by phone
// number, with car/plate parsed back out of the service strings.
//
// Parsing rather than schema: bookings store one `service` string («Vask
// utvendig Basic — VW Golf, AB 12345»), shared by chat and voice, and both
// prompts write car and plate into it in that shape. Extracting here keeps
// the booking schema untouched (it is shared surface area) at the cost of a
// best-effort parse — a field the parse can't find is left EMPTY, never
// guessed, which is exactly what the list's contract promises.

import type { AgentBookingRecord } from "@/lib/slots";

export type CustomerRow = {
  name: string;
  phone: string;
  car: string;
  regNr: string;
  /** Newest first: "24.08.2026: EU-kontroll personbil" */
  history: { date: string; service: string }[];
};

/** Norwegian standard plate: two letters, five digits. Spaces optional. */
const PLATE_RE = /\b([A-ZÆØÅ]{2})\s?(\d{5})\b/;

export function parseService(service: string | undefined): {
  service: string;
  car: string;
  regNr: string;
} {
  if (!service) return { service: "", car: "", regNr: "" };
  let rest = service;

  const plateMatch = rest.match(PLATE_RE);
  const regNr = plateMatch ? `${plateMatch[1]} ${plateMatch[2]}` : "";
  if (plateMatch) rest = rest.replace(plateMatch[0], "");

  // Both prompt shapes put the car after the service name:
  //   «Vask utvendig Basic — VW Golf, AB 12345»   (current)
  //   «Vask utvendig Premium (VW Golf)»           (older chat bookings)
  let car = "";
  let name = rest;
  const dash = rest.split(/\s+—\s+/);
  const paren = rest.match(/^(.*?)\(([^)]+)\)/);
  if (dash.length >= 2) {
    name = dash[0];
    // The car part may still carry notes ("+ ønsker vurdering av PDR") and
    // leftovers from the plate removal ("reg.nr tas ved levering").
    car = dash
      .slice(1)
      .join(" ")
      .split(/[+]/)[0]
      .replace(/reg\.?\s?nr\.?( tas ved levering)?/i, "")
      .replace(/kilometerstand.*$/i, "")
      .replace(/[,\s]+$/g, "")
      .replace(/^[,\s]+/g, "")
      .trim();
  } else if (paren) {
    name = paren[1];
    car = paren[2].trim();
  }

  return { service: name.replace(/[,\s]+$/g, "").trim(), car, regNr };
}

/** Digits only, so «983 61 774» and «98361774» are the same customer. */
function phoneKey(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Groups bookings into one row per customer, newest activity first. Fields
 *  fill from the NEWEST booking that has them — a later booking without a
 *  plate must not blank out an earlier one that had it. */
export function buildCustomerRows(bookings: AgentBookingRecord[]): CustomerRow[] {
  const byPhone = new Map<string, { row: CustomerRow; latest: string }>();
  const sorted = [...bookings].sort((a, b) =>
    `${a.date}T${a.time}` < `${b.date}T${b.time}` ? 1 : -1,
  );

  for (const b of sorted) {
    const key = phoneKey(b.customerPhone);
    if (!key) continue; // no phone = no identity to group on
    const parsed = parseService(b.service);
    let entry = byPhone.get(key);
    if (!entry) {
      entry = {
        row: { name: "", phone: b.customerPhone ?? "", car: "", regNr: "", history: [] },
        latest: `${b.date}T${b.time}`,
      };
      byPhone.set(key, entry);
    }
    // Newest-first iteration: only fill fields that are still empty.
    if (!entry.row.name && b.customerName) entry.row.name = b.customerName;
    if (!entry.row.car && parsed.car) entry.row.car = parsed.car;
    if (!entry.row.regNr && parsed.regNr) entry.row.regNr = parsed.regNr;
    entry.row.history.push({ date: displayDate(b.date), service: parsed.service });
  }

  return [...byPhone.values()]
    .sort((a, b) => (a.latest < b.latest ? 1 : -1))
    .map((e) => e.row);
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Semicolon-separated with a BOM — what Norwegian-locale Excel opens
 *  correctly by double-click. */
export function customersToCsv(rows: CustomerRow[]): string {
  const header = ["Navn", "Telefonnummer", "Bil", "Registreringsnummer", "Historikk"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.phone,
      r.car,
      r.regNr,
      r.history.map((h) => `${h.date}: ${h.service}`).join(" | "),
    ]
      .map(csvCell)
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
