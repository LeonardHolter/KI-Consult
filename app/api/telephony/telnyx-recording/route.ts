// Telnyx call-recording webhook. Handles BOTH shapes Telnyx uses:
//
//  1. TeXML recordingStatusCallback (what our <Dial record> requests): flat
//     fields — RecordingUrl, RecordingDuration, RecordingSid,
//     RecordingStatus:"completed" — sent as JSON or form-encoded.
//  2. Telnyx-native `call.recording.saved` events (number-level recording),
//     wrapped in { data: { event_type, payload } }.
//
// Either way we download the audio IMMEDIATELY (Telnyx recording URLs are
// only valid ~10 minutes after the call) and store it in the SAME recordings
// system the dashboard agent uses (lib/voiceRecordings), tagged
// recordedBy:"phone", so real phone calls appear in the «Samtaleopptak»
// panel for admin and client alike. Idempotent on RecordingSid — Telnyx
// retries webhooks, and a retry must not duplicate or 502.

import { PHONE_CLIENT_ID } from "@/lib/telephony/config";
import { listRecordings, saveRecording } from "@/lib/voiceRecordings";

export const dynamic = "force-dynamic";

// Telnyx does NOT serve recordings from a telnyx.com host. It hands out
// PRE-SIGNED S3 links on the shared s3.amazonaws.com host — documented
// example bucket `telephony-recorder-prod`, signature in the query string,
// valid 10 minutes. The first version of this guard allowed only *.telnyx.com
// and therefore threw away the first real recording we ever received
// (2026-07-25 14:14 UTC, "rejected non-Telnyx URL host { host:
// 's3.amazonaws.com' }"). So: allow Telnyx's own hosts, plus S3 URLs whose
// BUCKET is Telnyx's. Allowing bare s3.amazonaws.com would let any bucket in,
// which is the SSRF hole this guard exists to close.
const TELNYX_BUCKET = /^telephony-recorder(-[a-z0-9]+)*$/;
const S3_PATH_STYLE = /^s3([.-][a-z0-9-]+)*\.amazonaws\.com$/;
const S3_VHOST_STYLE = /^([a-z0-9.-]+)\.s3([.-][a-z0-9-]+)*\.amazonaws\.com$/;

function isTelnyxApiHost(host: string): boolean {
  return host === "telnyx.com" || host.endsWith(".telnyx.com");
}

function isTelnyxRecordingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (isTelnyxApiHost(url.hostname)) return true;
  if (S3_PATH_STYLE.test(url.hostname)) {
    return TELNYX_BUCKET.test(url.pathname.split("/")[1] ?? "");
  }
  const vhost = S3_VHOST_STYLE.exec(url.hostname);
  return vhost ? TELNYX_BUCKET.test(vhost[1]) : false;
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(await req.text()));
    }
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type RecordingInfo = {
  url: string;
  id: string;
  durationSeconds: number;
  startedAt: string;
};

/** Normalizes the two webhook shapes into one. Returns null for events that
 *  aren't a completed recording (we ack those so Telnyx stops retrying). */
function extractRecording(body: Record<string, unknown>): RecordingInfo | null {
  // Shape 1: TeXML recordingStatusCallback (flat).
  if (typeof body.RecordingUrl === "string" && body.RecordingUrl) {
    if (body.RecordingStatus && body.RecordingStatus !== "completed") return null;
    const durationSeconds = Math.max(0, Math.round(Number(body.RecordingDuration ?? 0)) || 0);
    return {
      url: body.RecordingUrl,
      id: `phone-${String(body.RecordingSid ?? body.CallSid ?? Date.now())}`,
      durationSeconds,
      // The TeXML callback carries no start time; the call just ended, so
      // now-minus-duration is the honest approximation for the panel label.
      startedAt: new Date(Date.now() - durationSeconds * 1000).toISOString(),
    };
  }

  // Shape 2: Telnyx-native call.recording.saved.
  const data = body.data as
    | {
        event_type?: string;
        payload?: {
          recording_started_at?: string;
          recording_ended_at?: string;
          recording_urls?: { mp3?: string | null; wav?: string | null };
          public_recording_urls?: { mp3?: string | null; wav?: string | null };
        };
      }
    | undefined;
  if (data?.event_type === "call.recording.saved" && data.payload) {
    const p = data.payload;
    const url = p.recording_urls?.mp3 ?? p.public_recording_urls?.mp3 ?? p.recording_urls?.wav;
    if (!url) return null;
    const startedAt = p.recording_started_at ?? new Date().toISOString();
    const endedAt = p.recording_ended_at ?? startedAt;
    return {
      url,
      id: `phone-${startedAt.replace(/[:.]/g, "-")}`,
      durationSeconds: Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)),
      startedAt,
    };
  }

  return null;
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  if (!body) return Response.json({ error: "bad_body" }, { status: 400 });

  const rec = extractRecording(body);
  // Not a completed recording (progress events, unrelated webhooks): ack so
  // Telnyx stops retrying.
  if (!rec) return Response.json({ ok: true });

  if (!isTelnyxRecordingUrl(rec.url)) {
    // Log host AND path (never the query string — that's the S3 signature).
    // Host alone was not enough to tell "wrong bucket" from "wrong provider"
    // the first time this fired.
    console.warn("[telnyx-recording] rejected recording URL", {
      target: (() => {
        try {
          const u = new URL(rec.url);
          return `${u.hostname}${u.pathname}`;
        } catch {
          return rec.url.slice(0, 60);
        }
      })(),
    });
    return Response.json({ error: "no_valid_recording_url" }, { status: 400 });
  }

  // Idempotency: Telnyx retries webhooks; a recording we already stored is a
  // success, not a duplicate download.
  const existing = await listRecordings(PHONE_CLIENT_ID);
  if (existing.some((r) => r.id === rec.id)) {
    return Response.json({ ok: true, duplicate: true });
  }

  // The API key goes ONLY to telnyx.com endpoints. A pre-signed S3 link
  // carries its credentials in the query string, and S3 rejects any request
  // that also sends an Authorization header ("only one auth mechanism
  // allowed") — so sending the key there would turn a working download into a
  // 400. It is also a needless place to leak the key.
  const telnyxKey = process.env.TELNYX_API_KEY;
  const useApiKey = telnyxKey && isTelnyxApiHost(new URL(rec.url).hostname);
  const audioRes = await fetch(rec.url, {
    headers: useApiKey ? { Authorization: `Bearer ${telnyxKey}` } : {},
  });
  if (!audioRes.ok) {
    console.warn("[telnyx-recording] download failed", { status: audioRes.status });
    return Response.json({ error: "download_failed", status: audioRes.status }, { status: 502 });
  }
  const bytes = Buffer.from(await audioRes.arrayBuffer());
  // Trust the download's own content type over any guess from the URL.
  const mimeType = audioRes.headers.get("content-type")?.split(";")[0] || "audio/mpeg";

  await saveRecording(
    PHONE_CLIENT_ID,
    {
      id: rec.id,
      startedAt: rec.startedAt,
      durationSeconds: rec.durationSeconds,
      mimeType,
      recordedBy: "phone",
    },
    bytes,
  );
  console.info("[telnyx-recording] stored", { id: rec.id, seconds: rec.durationSeconds, bytes: bytes.length });

  return Response.json({ ok: true });
}
