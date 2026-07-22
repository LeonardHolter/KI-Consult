import fs from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";

/* ------------------------------------------------------------------ */
/* Voice-call recordings — the browser mixes mic + agent audio into    */
/* one MediaRecorder track and posts the result here on hangup. Stored */
/* as PRIVATE blobs (they are real conversations), served only through */
/* the authenticated playback route; a per-client index.json carries   */
/* the metadata the review panel lists. Mirrors the slots.ts storage   */
/* idiom: Vercel Blob when configured, local data/ dir in dev.         */
/* ------------------------------------------------------------------ */

export type RecordingMeta = {
  id: string;
  startedAt: string; // ISO
  durationSeconds: number;
  sizeBytes: number;
  mimeType: string;
  /** Who made the call. Admin test calls are hidden from the client's
   *  dashboard; missing (pre-field recordings) is treated as "admin" —
   *  every recording from before this field existed was an admin test. */
  recordedBy?: "admin" | "client";
};

/** Newest first. Capped so the index (and the panel) can't grow unbounded. */
const MAX_INDEX_ENTRIES = 200;

const DATA_DIR = path.join(process.cwd(), "data");

const indexBlobPath = (clientId: string) => `${clientId}/voice-recordings/index.json`;
const audioBlobPath = (clientId: string, id: string) => `${clientId}/voice-recordings/${id}`;

const indexFile = (clientId: string) =>
  path.join(DATA_DIR, clientId, "voice-recordings", "index.json");
const audioFile = (clientId: string, id: string) =>
  path.join(DATA_DIR, clientId, "voice-recordings", id);

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function listRecordings(clientId: string): Promise<RecordingMeta[]> {
  try {
    if (blobConfigured()) {
      const result = await get(indexBlobPath(clientId), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return [];
      return JSON.parse(await new Response(result.stream).text()) as RecordingMeta[];
    }
    if (fs.existsSync(indexFile(clientId))) {
      return JSON.parse(fs.readFileSync(indexFile(clientId), "utf-8"));
    }
    return [];
  } catch {
    return [];
  }
}

async function writeIndex(clientId: string, entries: RecordingMeta[]) {
  if (blobConfigured()) {
    await put(indexBlobPath(clientId), JSON.stringify(entries, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(indexFile(clientId)), { recursive: true });
    fs.writeFileSync(indexFile(clientId), JSON.stringify(entries, null, 2));
  }
}

export async function saveRecording(
  clientId: string,
  meta: Omit<RecordingMeta, "sizeBytes">,
  bytes: Buffer,
): Promise<RecordingMeta> {
  const full: RecordingMeta = { ...meta, sizeBytes: bytes.byteLength };
  if (blobConfigured()) {
    await put(audioBlobPath(clientId, meta.id), bytes, {
      access: "private",
      contentType: meta.mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    fs.mkdirSync(path.dirname(audioFile(clientId, meta.id)), { recursive: true });
    fs.writeFileSync(audioFile(clientId, meta.id), bytes);
  }
  const existing = await listRecordings(clientId);
  const next = [full, ...existing.filter((e) => e.id !== full.id)].slice(0, MAX_INDEX_ENTRIES);
  await writeIndex(clientId, next);
  return full;
}

/** Returns the audio bytes + metadata for the playback route, or null.
 *  Always a full Buffer: the playback route needs Content-Length and HTTP
 *  Range support for the <audio> scrubber to be seekable, and recordings
 *  are small (~240 KB/min), so buffering is the simpler correct choice. */
export async function readRecording(
  clientId: string,
  id: string,
): Promise<{ bytes: Buffer; meta: RecordingMeta } | null> {
  const meta = (await listRecordings(clientId)).find((e) => e.id === id);
  if (!meta) return null;
  try {
    if (blobConfigured()) {
      const result = await get(audioBlobPath(clientId, id), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return { bytes: Buffer.from(await new Response(result.stream).arrayBuffer()), meta };
    }
    if (fs.existsSync(audioFile(clientId, id))) {
      return { bytes: fs.readFileSync(audioFile(clientId, id)), meta };
    }
    return null;
  } catch {
    return null;
  }
}

/** Removes one recording: audio blob first, then its index entry. */
export async function deleteRecording(clientId: string, id: string): Promise<boolean> {
  const entries = await listRecordings(clientId);
  if (!entries.some((e) => e.id === id)) return false;
  if (blobConfigured()) {
    await del(audioBlobPath(clientId, id)).catch(() => {
      /* already gone is fine — the index entry still gets removed */
    });
  } else if (fs.existsSync(audioFile(clientId, id))) {
    fs.unlinkSync(audioFile(clientId, id));
  }
  await writeIndex(clientId, entries.filter((e) => e.id !== id));
  return true;
}
