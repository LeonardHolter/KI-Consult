// Streams one recording's audio to the admin review panel's <audio>
// element. Auth per request (session cookie), so private blobs stay
// private — no direct storage URL ever reaches the browser.

import { getProfile } from "@/lib/portal/data";
import { readRecording } from "@/lib/voiceRecordings";

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

  return new Response(rec.bytes as BodyInit, {
    headers: {
      "Content-Type": rec.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
