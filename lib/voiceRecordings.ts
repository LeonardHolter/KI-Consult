import fs from "fs";
import path from "path";
import { del, get, list, put } from "@vercel/blob";

/* ------------------------------------------------------------------ */
/* Voice-call recordings — the browser mixes mic + agent audio into    */
/* one MediaRecorder track and posts the result here on hangup. Stored */
/* as PRIVATE blobs (they are real conversations), served only through */
/* the authenticated playback route.                                   */
/*                                                                     */
/* Design constraint learned the hard way: Vercel Blob caches          */
/* OVERWRITTEN paths for up to ~60s, so a shared mutable index.json    */
/* plus read-modify-write deletion resurrected deleted entries (delete */
/* B read a stale index that still contained just-deleted A, and wrote */
/* A back). Therefore: NO shared mutable state. Every recording is two */
/* immutable blobs — the audio and a {id}.meta.json written exactly    */
/* once — listing enumerates the store, and deletion deletes the two   */
/* blobs. There is nothing left to resurrect from.                     */
/* ------------------------------------------------------------------ */

export type RecordingMeta = {
  id: string;
  startedAt: string; // ISO
  durationSeconds: number;
  sizeBytes: number;
  mimeType: string;
  /** Who made the call. Admin test calls are hidden from the client's
   *  dashboard; missing (pre-field recordings) is treated as "admin". */
  /** admin/client = browser test calls; phone = a real inbound phone call
   *  captured by Telnyx. Both client and phone are customer-facing and show
   *  on the client dashboard; admin (test) calls stay admin-only. */
  recordedBy?: "admin" | "client" | "phone";
};

/** Newest first; the panel never renders more than this. */
const MAX_LISTED = 200;

const DATA_DIR = path.join(process.cwd(), "data");
const META_SUFFIX = ".meta.json";

const prefix = (clientId: string) => `${clientId}/voice-recordings/`;
const audioBlobPath = (clientId: string, id: string) => `${prefix(clientId)}${id}`;
const metaBlobPath = (clientId: string, id: string) => `${prefix(clientId)}${id}${META_SUFFIX}`;

const recordingsDir = (clientId: string) => path.join(DATA_DIR, clientId, "voice-recordings");
const audioFile = (clientId: string, id: string) => path.join(recordingsDir(clientId), id);
const metaFile = (clientId: string, id: string) =>
  path.join(recordingsDir(clientId), `${id}${META_SUFFIX}`);

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readJsonBlob(pathname: string): Promise<RecordingMeta | null> {
  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as RecordingMeta;
  } catch {
    return null;
  }
}

export async function listRecordings(clientId: string): Promise<RecordingMeta[]> {
  try {
    let metas: RecordingMeta[];
    if (blobConfigured()) {
      const { blobs } = await list({ prefix: prefix(clientId), limit: 1000 });
      const metaPaths = blobs
        .map((b) => b.pathname)
        .filter((p) => p.endsWith(META_SUFFIX));
      metas = (await Promise.all(metaPaths.map(readJsonBlob))).filter(
        (m): m is RecordingMeta => m !== null,
      );
    } else if (fs.existsSync(recordingsDir(clientId))) {
      metas = fs
        .readdirSync(recordingsDir(clientId))
        .filter((f) => f.endsWith(META_SUFFIX))
        .map((f) => JSON.parse(fs.readFileSync(path.join(recordingsDir(clientId), f), "utf-8")));
    } else {
      return [];
    }
    return metas
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, MAX_LISTED);
  } catch {
    return [];
  }
}

export async function saveRecording(
  clientId: string,
  meta: Omit<RecordingMeta, "sizeBytes">,
  bytes: Buffer,
): Promise<RecordingMeta> {
  const full: RecordingMeta = { ...meta, sizeBytes: bytes.byteLength };
  if (blobConfigured()) {
    // Both blobs are write-once (unique id per call) — allowOverwrite stays
    // off on purpose so nothing here can ever become mutable shared state.
    await put(audioBlobPath(clientId, meta.id), bytes, {
      access: "private",
      contentType: meta.mimeType,
      addRandomSuffix: false,
    });
    await put(metaBlobPath(clientId, meta.id), JSON.stringify(full, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } else {
    fs.mkdirSync(recordingsDir(clientId), { recursive: true });
    fs.writeFileSync(audioFile(clientId, meta.id), bytes);
    fs.writeFileSync(metaFile(clientId, meta.id), JSON.stringify(full, null, 2));
  }
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
  try {
    if (blobConfigured()) {
      const meta = await readJsonBlob(metaBlobPath(clientId, id));
      if (!meta) return null;
      const result = await get(audioBlobPath(clientId, id), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return { bytes: Buffer.from(await new Response(result.stream).arrayBuffer()), meta };
    }
    if (fs.existsSync(metaFile(clientId, id)) && fs.existsSync(audioFile(clientId, id))) {
      return {
        bytes: fs.readFileSync(audioFile(clientId, id)),
        meta: JSON.parse(fs.readFileSync(metaFile(clientId, id), "utf-8")),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Removes one recording: both its blobs. No index exists, so a deletion
 *  can never be undone by a concurrent stale read elsewhere. */
export async function deleteRecording(clientId: string, id: string): Promise<boolean> {
  if (blobConfigured()) {
    const meta = await readJsonBlob(metaBlobPath(clientId, id));
    if (!meta) return false;
    await del(metaBlobPath(clientId, id)).catch(() => {});
    await del(audioBlobPath(clientId, id)).catch(() => {});
    return true;
  }
  if (!fs.existsSync(metaFile(clientId, id))) return false;
  fs.unlinkSync(metaFile(clientId, id));
  if (fs.existsSync(audioFile(clientId, id))) fs.unlinkSync(audioFile(clientId, id));
  return true;
}
