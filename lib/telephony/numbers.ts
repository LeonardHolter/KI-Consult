import fs from "fs";
import path from "path";
import { get, put } from "@vercel/blob";

// Phone-number -> client routing map, the piece that turns the single
// hardcoded PHONE_CLIENT_ID line into "connect a number per client from the
// dashboard". One small global JSON (numbers are assigned a few times a
// year, read once per incoming call) — a table would be a migration for a
// map with a handful of keys.
//
// NOTE the Blob overwrite cache: an updated mapping can take up to ~60s to
// be visible to the incoming-call webhook. Fine for an admin assignment
// flow; the UI says so.
//
// Numbers are stored NORMALIZED (digits only, no +/spaces) because the same
// number arrives in different dresses: "+47 32 99 42 23" from a human,
// "sip:+4732994223@sip.telnyx.com" in the SIP To-header.

const BLOB_PATH = "telephony/numbers.json";
const FILE_PATH = path.join(process.cwd(), "data", "telephony", "numbers.json");

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Digits only: "+47 32 99 42 23" -> "4732994223". */
export function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Pulls the dialed number out of a SIP URI ("sip:+4732994223@host;tag=x").
 *  Returns null when there is no number to find. */
export function numberFromSipUri(uri: string | undefined | null): string | null {
  if (!uri) return null;
  const m = /sips?:([^@;>]+)/i.exec(uri);
  const digits = normalizeNumber(m ? m[1] : uri);
  return digits.length >= 8 ? digits : null;
}

/** number (normalized) -> client UUID */
export type NumberAssignments = Record<string, string>;

export async function loadAssignments(): Promise<NumberAssignments> {
  try {
    if (blobConfigured()) {
      const result = await get(BLOB_PATH, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return {};
      return JSON.parse(await new Response(result.stream).text()) as NumberAssignments;
    }
    if (fs.existsSync(FILE_PATH)) {
      return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8")) as NumberAssignments;
    }
  } catch {
    /* unreadable store — treat as empty rather than blocking calls */
  }
  return {};
}

async function saveAssignments(map: NumberAssignments): Promise<void> {
  const json = JSON.stringify(map, null, 2);
  if (blobConfigured()) {
    await put(BLOB_PATH, json, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, json);
  }
}

/** Assigns a number to a client. A number can serve exactly one client; a
 *  client keeps at most one number (assigning a new one releases the old). */
export async function assignNumber(rawNumber: string, clientId: string): Promise<void> {
  const number = normalizeNumber(rawNumber);
  const map = await loadAssignments();
  for (const [num, cid] of Object.entries(map)) {
    if (cid === clientId) delete map[num];
  }
  map[number] = clientId;
  await saveAssignments(map);
}

export async function unassignClient(clientId: string): Promise<void> {
  const map = await loadAssignments();
  let changed = false;
  for (const [num, cid] of Object.entries(map)) {
    if (cid === clientId) {
      delete map[num];
      changed = true;
    }
  }
  if (changed) await saveAssignments(map);
}

export async function clientForNumber(rawNumber: string): Promise<string | null> {
  const map = await loadAssignments();
  return map[normalizeNumber(rawNumber)] ?? null;
}

export async function numberForClient(clientId: string): Promise<string | null> {
  const map = await loadAssignments();
  for (const [num, cid] of Object.entries(map)) {
    if (cid === clientId) return num;
  }
  return null;
}
