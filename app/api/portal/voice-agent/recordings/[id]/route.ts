// Streams one recording's audio to the review panel's <audio> element, and
// deletes a recording (admin only). Auth per request (session cookie), so
// private blobs stay private — no direct storage URL ever reaches the
// browser.
//
// GET supports HTTP Range and always sends Content-Length: without those
// the <audio> scrubber is dead — the browser can't seek, and MediaRecorder
// webm lacks a duration header, so the slider just sits pinned at max.

import { getProfile } from "@/lib/portal/data";
import { deleteRecording, readRecording } from "@/lib/voiceRecordings";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });
  // Admin picks the client; a client account is pinned to its own client —
  // the query param is ignored for them, never trusted.
  const clientId =
    profile.role === "admin"
      ? new URL(req.url).searchParams.get("clientId")
      : profile.client_id;
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const { id } = await params;
  // The id is only honored if it exists in the client's index, so a crafted
  // path can never reach another client's (or non-recording) blob.
  const rec = await readRecording(clientId, id);
  if (!rec) return Response.json({ error: "not_found" }, { status: 404 });
  // Same visibility rule as the listing: a client can only play their own
  // calls — admin test recordings (incl. pre-recordedBy ones) 404 for them.
  if (profile.role !== "admin" && rec.meta.recordedBy !== "client") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const total = rec.bytes.byteLength;
  const baseHeaders = {
    "Content-Type": rec.meta.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] !== "" || m[2] !== "")) {
    const start = m[1] === "" ? Math.max(0, total - Number(m[2])) : Number(m[1]);
    const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
      });
    }
    return new Response(rec.bytes.subarray(start, end + 1) as unknown as BodyInit, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(rec.bytes as unknown as BodyInit, {
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  // Deleting review material is an admin decision — client accounts can
  // listen to their own calls but not remove them.
  if (!profile || profile.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ error: "no_client" }, { status: 400 });

  const { id } = await params;
  const removed = await deleteRecording(clientId, id);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
