import fs from "fs";
import path from "path";
import { get, put } from "@vercel/blob";

export type Settings = {
  /** Google Calendar ID the store shared with the service account. */
  calendarId?: string;
  /** Human-readable calendar name (from the connection test). */
  calendarName?: string;
  locationName: string;
  /** Store opens (Europe/Oslo, HH:MM). */
  openTime: string;
  /** Store closes (Europe/Oslo, HH:MM) — informational; last bookable start is lastSlotTime. */
  closeTime: string;
  /** Length of each regular hourly slot, in minutes. */
  slotMinutes: number;
  /** Max concurrent bookings per regular hourly slot. */
  capacityPerSlot: number;
  /** The final bookable start time of the day (HH:MM), after the regular hourly grid. */
  lastSlotTime: string;
  /** Max concurrent bookings in the final slot. */
  lastSlotCapacity: number;
  /** Service name must contain this substring (case-insensitive) to be bookable in the final slot. */
  lastSlotServiceKeyword: string;
  /** How many business days ahead to offer. */
  daysAhead: number;
  /**
   * Where the VOICE agent's bookings go.
   *
   * "sandbox" (default) — an isolated fake calendar, never Google, even when
   *   a real calendar is connected. Lets the voice agent's booking flow be
   *   exercised end-to-end without putting test bookings in front of the
   *   business. The chat bot is unaffected and always books live.
   * "live" — the voice agent books exactly where the chat bot does.
   *
   * Defaults to sandbox so a newly wired-up voice agent can never write to a
   * real calendar until someone deliberately flips it.
   */
  voiceBookingMode: "sandbox" | "live";
};

export const DEFAULT_SETTINGS: Settings = {
  locationName: "Strømmen Senter",
  // Store opens 09:30, so the earliest bookable slot is 09:30 (per owner).
  openTime: "09:30",
  closeTime: "21:00",
  slotMinutes: 60,
  capacityPerSlot: 2,
  lastSlotTime: "19:30",
  lastSlotCapacity: 2,
  lastSlotServiceKeyword: "utvendig",
  daysAhead: 3,
  voiceBookingMode: "sandbox",
};

// Booking-calendar config lives per client (Blob key keyed by client UUID) —
// distinct from the client's chat prompt/branding, which lives in Postgres
// (chat_bot_settings) since it needs admin RLS + version history.
const blobPath = (clientId: string) => `${clientId}/settings.json`;
const filePath = (clientId: string) => path.join(process.cwd(), "data", clientId, "settings.json");

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function loadSettings(clientId: string): Promise<Settings> {
  try {
    if (blobConfigured()) {
      const result = await get(blobPath(clientId), { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        return { ...DEFAULT_SETTINGS, ...JSON.parse(text) };
      }
    } else if (fs.existsSync(filePath(clientId))) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(filePath(clientId), "utf-8")) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(clientId: string, patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings(clientId)), ...patch };
  if (blobConfigured()) {
    await put(blobPath(clientId), JSON.stringify(merged, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(filePath(clientId)), { recursive: true });
    fs.writeFileSync(filePath(clientId), JSON.stringify(merged, null, 2));
  }
  return merged;
}
