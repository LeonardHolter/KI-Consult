// The booking tools, shared by BOTH surfaces: the website chat bot (Claude,
// server-side agentic loop in app/api/chat/route.ts) and the voice agent
// (OpenAI Realtime, tool calls arriving over the browser's WebRTC data
// channel and executed via app/api/portal/voice-agent/tools).
//
// This exists as one module rather than two copies on purpose. The chat and
// voice *prompts* already drifted apart once — the voice agent quoted a stale
// motorvask duration for two days because nothing compared them. Tool
// behaviour is far worse to have drift, because a mismatch there means the
// two surfaces disagree about what is actually bookable. So the schemas and
// the execution live here once, and each surface only adapts the shape.
//
// Scope: every call takes a BookingScope. The chat bot always passes "live".
// The voice agent passes whatever the client's Settings.voiceBookingMode says
// — "sandbox" until someone deliberately switches it to live.

import {
  appendBookingNote,
  bookSlot,
  findBookingsByPhone,
  loadSlots,
  rescheduleBooking,
  type BookingScope,
} from "@/lib/slots";
import { osloParts } from "@/lib/google-calendar";

export const GET_SLOTS_TOOL = "get_available_demo_slots";
export const BOOK_SLOT_TOOL = "book_demo_slot";
export const ADD_NOTE_TOOL = "add_booking_note";
export const FIND_BOOKINGS_TOOL = "find_my_bookings";
export const RESCHEDULE_TOOL = "reschedule_booking";

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/** «torsdag 14. august kl. 10:00» / «i dag kl. 10:00» — the speech-friendly
 *  form both slot listings and booking lookups present times in. */
function spokenLabel(date: string, time: string, todayDate: string): string {
  const d = new Date(`${date}T${time}:00`);
  return `${date === todayDate ? "i dag" : WEEKDAYS[d.getDay()]} ${d.getDate()}. ${d.toLocaleString("no", { month: "long" })} kl. ${time}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * JSON Schema for each tool's arguments — the single source of truth. Both
 * surfaces wrap these in their own provider-specific envelope (Anthropic
 * wants `input_schema`, OpenAI Realtime wants `parameters`), but the schema
 * itself is identical, so the two agents can never be offered different
 * arguments for the same operation.
 */
export const BOOKING_TOOL_SCHEMAS = {
  [GET_SLOTS_TOOL]: {
    description:
      "Henter ledige timer fra kalenderen. Bruk alltid dette verktøyet før du foreslår tidspunkter til kunden. Bruk near_time når et ønsket tidspunkt ikke er tilgjengelig, for å få de nærmeste alternativene øverst i listen.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: ["string", "null"],
          description: "Filtrer til denne datoen (YYYY-MM-DD). Sett null for å hente alle dager.",
        },
        near_time: {
          type: ["string", "null"],
          description:
            "Klokkeslett (HH:MM) resultatene skal sorteres etter nærhet til — bruk det tidspunktet kunden egentlig ønsket, slik at nærmeste ledige alternativ kommer først. Sett null hvis ikke aktuelt.",
        },
      },
      required: ["date", "near_time"],
      additionalProperties: false,
    },
  },
  [BOOK_SLOT_TOOL]: {
    description:
      "Booker en time for kunden. Bruk kun etter at kunden eksplisitt har bekreftet tjeneste, tidspunkt, navn og telefonnummer.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: `Datoen for timen, format YYYY-MM-DD, nøyaktig som returnert fra ${GET_SLOTS_TOOL}`,
        },
        time: {
          type: "string",
          description: `Klokkeslettet for timen, format HH:MM, nøyaktig som returnert fra ${GET_SLOTS_TOOL}`,
        },
        customer_name: { type: "string", description: "Kundens fulle navn" },
        customer_phone: { type: "string", description: "Kundens telefonnummer" },
        service: {
          type: "string",
          description:
            "Tjenesten timen gjelder, f.eks. 'Utvendig vask - Basic', 'Polering', 'Hjulskift'",
        },
      },
      required: ["date", "time", "customer_name", "customer_phone", "service"],
      additionalProperties: false,
    },
  },
  [ADD_NOTE_TOOL]: {
    description:
      `Legger et notat på en booking som ALLEREDE er opprettet i denne samtalen — for eksempel når kunden etter bookingen ønsker en vurdering av PDR/bulk eller en ekstra tjeneste uten fast pris. Notatet legges i bookingens tjenestefelt så avdelingen ser det ved levering. Bruk KUN for tilleggsønsker på en eksisterende booking — aldri for å endre tidspunkt (har du verktøyet ${RESCHEDULE_TOOL}, er det DET som flytter en time) eller avbestille (det kan du ikke; henvis til avdelingen). Si aldri at noe er notert før verktøyet har svart success: true.`,
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Datoen bookingen ble gjort på, format YYYY-MM-DD, nøyaktig som da du booket",
        },
        time: {
          type: "string",
          description: "Klokkeslettet bookingen ble gjort på, format HH:MM, nøyaktig som da du booket",
        },
        customer_phone: {
          type: "string",
          description: "Telefonnummeret bookingen ble gjort med",
        },
        note: {
          type: "string",
          description:
            "Kort notat til avdelingen, f.eks. 'Kunden ønsker vurdering/pris av PDR/bulk ved levering'",
        },
      },
      required: ["date", "time", "customer_phone", "note"],
      additionalProperties: false,
    },
  },
};

/**
 * Voice-only booking tools — deliberately NOT in BOOKING_TOOL_SCHEMAS, which
 * the chat bot registers wholesale. The phone number is both the lookup key
 * and the only proof of identity here, and that is only sound when it is
 * grounded by caller ID: on a phone call the agent knows what number the
 * customer is actually calling from, while in the website chat anyone could
 * type a stranger's number and list or move their booking. So these register
 * only via realtimeToolDefs().
 */
export const VOICE_ONLY_BOOKING_TOOL_SCHEMAS = {
  [FIND_BOOKINGS_TOOL]: {
    description:
      "Finner kundens kommende bookinger ut fra telefonnummeret bookingen ble gjort med. Bruk når kunden vil endre eller flytte en eksisterende time. Bekreft alltid med kunden HVILKEN booking det gjelder før du endrer noe.",
    parameters: {
      type: "object",
      properties: {
        customer_phone: {
          type: "string",
          description: "Telefonnummeret bookingen ble gjort med",
        },
      },
      required: ["customer_phone"],
      additionalProperties: false,
    },
  },
  [RESCHEDULE_TOOL]: {
    description:
      `Flytter en eksisterende booking til et nytt tidspunkt. Bruk KUN etter at ${FIND_BOOKINGS_TOOL} har funnet bookingen, kunden har bekreftet hvilken booking det gjelder, og det nye tidspunktet er hentet fra ${GET_SLOTS_TOOL} og bekreftet av kunden. Si aldri at timen er flyttet før verktøyet har svart success: true.`,
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: `Bookingens NÅVÆRENDE dato, format YYYY-MM-DD, nøyaktig som returnert fra ${FIND_BOOKINGS_TOOL}`,
        },
        time: {
          type: "string",
          description: `Bookingens NÅVÆRENDE klokkeslett, format HH:MM, nøyaktig som returnert fra ${FIND_BOOKINGS_TOOL}`,
        },
        customer_phone: {
          type: "string",
          description: "Telefonnummeret bookingen ble gjort med",
        },
        new_date: {
          type: "string",
          description: `Ny dato, format YYYY-MM-DD, nøyaktig som returnert fra ${GET_SLOTS_TOOL}`,
        },
        new_time: {
          type: "string",
          description: `Nytt klokkeslett, format HH:MM, nøyaktig som returnert fra ${GET_SLOTS_TOOL}`,
        },
      },
      required: ["date", "time", "customer_phone", "new_date", "new_time"],
      additionalProperties: false,
    },
  },
};

/**
 * Voice-only call-control tool. The name matches OpenAI's trained common
 * tool (`finish_session`) — the realtime prompting guide says the model is
 * trained on these exact names/shapes, so staying close maximises
 * reliability. It is NOT part of BOOKING_TOOL_SCHEMAS on purpose: the chat
 * bot has no call to hang up, and the server-side executor never sees it —
 * the browser intercepts it and ends the WebRTC call locally (after the
 * farewell audio finishes playing).
 */
export const FINISH_SESSION_TOOL = "finish_session";

/** The hangup tool's Realtime definition, exported separately so surfaces
 *  WITHOUT a booking executor (the public marketing demo) can register it
 *  alone — a graceful hangup needs no server side, the browser intercepts
 *  it, and registering the booking tools there would leave calls hanging. */
export function finishSessionToolDef() {
  return {
    type: "function" as const,
    name: FINISH_SESSION_TOOL,
    description:
      "Avslutter telefonsamtalen (legger på). Kall den i SAMME replikk som avslutningen. Blir du avbrutt mens du sier avslutningen, fortsetter samtalen automatisk og du kan kalle verktøyet igjen senere. Legg aldri på uten å si en avslutning først.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  };
}

/** OpenAI Realtime session tool definitions, derived from the shared schemas
 *  plus the voice-only ones (see VOICE_ONLY_BOOKING_TOOL_SCHEMAS for why the
 *  find/reschedule pair never reaches the chat bot). */
export function realtimeToolDefs() {
  return [
    ...Object.entries({ ...BOOKING_TOOL_SCHEMAS, ...VOICE_ONLY_BOOKING_TOOL_SCHEMAS }).map(
      ([name, spec]) => ({
        type: "function" as const,
        name,
        description: spec.description,
        parameters: spec.parameters,
      }),
    ),
    finishSessionToolDef(),
  ];
}

export type BookingToolResult = Record<string, unknown>;

/**
 * Executes one booking tool call and returns the JSON-serialisable result the
 * model should see. Never throws — a thrown error inside an agent loop is far
 * less useful to the model than a structured `{ error }` it can talk about.
 */
export async function execBookingTool(
  clientId: string,
  name: string,
  input: unknown,
  scope: BookingScope = "live",
): Promise<BookingToolResult> {
  try {
    if (name === GET_SLOTS_TOOL) {
      const { date, near_time } = (input ?? {}) as {
        date?: string | null;
        near_time?: string | null;
      };
      const now = osloParts(new Date().toISOString());
      let filtered = (await loadSlots(clientId, scope))
        .filter((s) => !s.full)
        .filter((s) => s.date !== now.date || s.time > now.time);
      if (date) filtered = filtered.filter((s) => s.date === date);

      let available = filtered.map((s) => {
        return {
          label: spokenLabel(s.date, s.time, now.date),
          date: s.date,
          time: s.time,
          location: s.location,
          spots_left: s.capacity - s.bookedCount,
          service_restriction: s.serviceKeyword ?? null,
        };
      });

      if (near_time) {
        const targetMin = toMinutes(near_time);
        available = available.sort((a, b) =>
          a.date !== b.date
            ? a.date < b.date
              ? -1
              : 1
            : Math.abs(toMinutes(a.time) - targetMin) - Math.abs(toMinutes(b.time) - targetMin),
        );
      } else {
        available = available.sort((a, b) =>
          a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time < b.time ? -1 : 1,
        );
      }

      return {
        today: now.date,
        current_time: now.time,
        available_slots: available,
        note: "Har et tidspunkt en service_restriction, må du nevne restriksjonen når du foreslår det til kunden. Bruk feltet 'today' til å vite hvilken dato som er i dag. Listen er sortert nærmest 'near_time' først når det er oppgitt.",
      };
    }

    if (name === BOOK_SLOT_TOOL) {
      const { date, time, customer_name, customer_phone, service } = (input ?? {}) as {
        date?: string;
        time?: string;
        customer_name?: string;
        customer_phone?: string;
        service?: string;
      };
      if (!date || !time || !customer_name || !customer_phone) {
        return { success: false, error: "Mangler dato, tid, navn eller telefonnummer." };
      }
      // The model occasionally emits "9:30" rather than "09:30"; the slot id
      // is built from the padded form, so normalise before looking it up.
      const normalizedTime = time.trim().replace(/^(\d):/, "0$1:").slice(0, 5);
      const slotId = `${date.trim()}-${normalizedTime.replace(":", "")}`;
      const result = await bookSlot(
        clientId,
        slotId,
        customer_name,
        customer_phone,
        service,
        scope,
      );
      return result.ok
        ? { success: true, slot: result.slot }
        : { success: false, error: result.error };
    }

    if (name === ADD_NOTE_TOOL) {
      const { date, time, customer_phone, note } = (input ?? {}) as {
        date?: string;
        time?: string;
        customer_phone?: string;
        note?: string;
      };
      if (!date || !time || !customer_phone || !note) {
        return { success: false, error: "Mangler dato, tid, telefonnummer eller notat." };
      }
      const normalizedTime = time.trim().replace(/^(\d):/, "0$1:").slice(0, 5);
      const result = await appendBookingNote(
        clientId,
        date.trim(),
        normalizedTime,
        customer_phone,
        note,
        scope,
      );
      return result.ok
        ? { success: true, service: result.service }
        : { success: false, error: result.error };
    }

    if (name === FIND_BOOKINGS_TOOL) {
      const { customer_phone } = (input ?? {}) as { customer_phone?: string };
      if (!customer_phone) return { success: false, error: "Mangler telefonnummer." };
      const now = osloParts(new Date().toISOString());
      const bookings = await findBookingsByPhone(clientId, customer_phone, scope);
      return {
        success: true,
        bookings: bookings.map((b) => ({
          label: spokenLabel(b.date, b.time, now.date),
          date: b.date,
          time: b.time,
          service: b.service ?? null,
          customer_name: b.customerName ?? null,
        })),
        note: "Bekreft med kunden hvilken booking det gjelder før du endrer noe. Er listen tom, finnes det ingen kommende booking på dette nummeret — kunden kan ha booket med et annet nummer.",
      };
    }

    if (name === RESCHEDULE_TOOL) {
      const { date, time, customer_phone, new_date, new_time } = (input ?? {}) as {
        date?: string;
        time?: string;
        customer_phone?: string;
        new_date?: string;
        new_time?: string;
      };
      if (!date || !time || !customer_phone || !new_date || !new_time) {
        return { success: false, error: "Mangler dato, tid, telefonnummer, ny dato eller ny tid." };
      }
      const norm = (t: string) => t.trim().replace(/^(\d):/, "0$1:").slice(0, 5);
      const result = await rescheduleBooking(
        clientId,
        {
          date: date.trim(),
          time: norm(time),
          customerPhone: customer_phone,
          newDate: new_date.trim(),
          newTime: norm(new_time),
        },
        scope,
      );
      if (!result.ok) return { success: false, error: result.error };
      const now = osloParts(new Date().toISOString());
      return {
        success: true,
        booking: {
          label: spokenLabel(result.booking.date, result.booking.time, now.date),
          date: result.booking.date,
          time: result.booking.time,
          service: result.booking.service ?? null,
        },
      };
    }

    return { error: `Ukjent verktøy: ${name}` };
  } catch (err) {
    console.error(`execBookingTool(${name}, scope=${scope}) failed:`, err);
    return {
      success: false,
      error: "Teknisk feil mot kalenderen. Be kunden ringe avdelingen i stedet.",
    };
  }
}
