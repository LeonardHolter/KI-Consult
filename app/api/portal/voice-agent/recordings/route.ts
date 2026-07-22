// Voice-call recordings: POST stores the browser-mixed audio of a finished
// call, GET lists a client's recordings for the admin review panel. The
// audio itself is served by the sibling [id] route — blobs are private, so
// nothing here ever exposes a direct storage URL.

import { getProfile } from "@/lib/portal/data";
import { listRecordings, saveRecording } from "@/lib/voiceRecordings";

export const dynamic = "force-dynamic";

// Mixed-down opus at ~32 kbps is ~240 KB/min; this cap allows well over an
// hour of audio while still bounding a hostile payload.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  // Same clientId resolution as the usage route: a client user is pinned to
  // their own client, an admin records for the client they're viewing.
  let clientId: string | null = profile.client_id;
  if (profile.role === "admin") {
    clientId = url.searchParams.get("clientId");
  }
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const startedAt = url.searchParams.get("startedAt");
  const durationSeconds = Number(url.searchParams.get("durationSeconds"));
  if (!startedAt || Number.isNaN(Date.parse(startedAt)) || !Number.isFinite(durationSeconds)) {
    return Response.json({ error: "invalid_meta" }, { status: 400 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.byteLength === 0) return Response.json({ error: "empty" }, { status: 400 });
  if (bytes.byteLength > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  const mimeType = req.headers.get("content-type") ?? "audio/webm";
  // Timestamp-first id keeps blob listings chronological and is unique
  // enough for one call at a time per client.
  const id = `${startedAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;

  const meta = await saveRecording(
    clientId,
    { id, startedAt, durationSeconds: Math.max(0, Math.round(durationSeconds)), mimeType },
    bytes,
  );
  return Response.json({ ok: true, recording: meta });
}

export async function GET(req: Request) {
  const profile = await getProfile();
  // Review is admin-only: recordings are real conversations, and the
  // dashboard's voice card is an admin surface today.
  if (!profile || profile.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });
  return Response.json({ recordings: await listRecordings(clientId) });
}
