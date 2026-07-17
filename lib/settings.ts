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
  /** Website chatbot system prompt (falls back to DEFAULT_CHAT_PROMPT). */
  chatPrompt?: string;
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
};

const BLOB_PATH = "handzon/settings.json";
const FILE = path.join(process.cwd(), "data", "settings.json");

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function loadSettings(): Promise<Settings> {
  try {
    if (blobConfigured()) {
      const result = await get(BLOB_PATH, { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        return { ...DEFAULT_SETTINGS, ...JSON.parse(text) };
      }
    } else if (fs.existsSync(FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(FILE, "utf-8")) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...patch };
  if (blobConfigured()) {
    await put(BLOB_PATH, JSON.stringify(merged, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(merged, null, 2));
  }
  return merged;
}
