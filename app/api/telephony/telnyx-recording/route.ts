// Telnyx call-recording webhook. When Telnyx finishes recording an inbound
// call, it POSTs a `call.recording.saved` event here with URLs to the audio.
// We download the file and store it in the SAME recordings system the
// dashboard agent uses (lib/voiceRecordings), tagged recordedBy:"phone", so
// real phone calls appear in the «Samtaleopptak» panel for admin and client.
//
// Enable this by turning on recording for the number in Telnyx and pointing
// its recording webhook here. Dormant until then.

import { PHONE_CLIENT_ID } from "@/lib/telephony/config";
import { saveRecording } from "@/lib/voiceRecordings";

export const dynamic = "force-dynamic";

type TelnyxRecordingEvent = {
  data?: {
    event_type?: string;
    payload?: {
      recording_started_at?: string;
      recording_ended_at?: string;
      recording_urls?: { mp3?: string | null; wav?: string | null };
      public_recording_urls?: { mp3?: string | null; wav?: string | null };
    };
  };
};

// Only ever download from Telnyx's own hosts — the URL comes from the request
// body, so without this an attacker could POST any URL and make us fetch it.
function isTelnyxUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "telnyx.com" || host.endsWith(".telnyx.com");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as TelnyxRecordingEvent | null;
  const p = body?.data?.payload;
  if (body?.data?.event_type !== "call.recording.saved" || !p) {
    // Ack other events so Telnyx stops retrying them.
    return Response.json({ ok: true });
  }

  const url = p.recording_urls?.mp3 ?? p.public_recording_urls?.mp3 ?? p.recording_urls?.wav;
  if (!url || !isTelnyxUrl(url)) {
    return Response.json({ error: "no_valid_recording_url" }, { status: 400 });
  }

  // Telnyx recording URLs are authenticated with the API key; the public_*
  // variant (if enabled) is not. Send the key when we have it.
  const telnyxKey = process.env.TELNYX_API_KEY;
  const audioRes = await fetch(url, {
    headers: telnyxKey ? { Authorization: `Bearer ${telnyxKey}` } : {},
  });
  if (!audioRes.ok) {
    return Response.json({ error: "download_failed", status: audioRes.status }, { status: 502 });
  }
  const bytes = Buffer.from(await audioRes.arrayBuffer());

  const startedAt = p.recording_started_at ?? new Date().toISOString();
  const endedAt = p.recording_ended_at ?? startedAt;
  const durationSeconds = Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  const id = `${startedAt.replace(/[:.]/g, "-")}-phone-${Math.random().toString(36).slice(2, 8)}`;

  await saveRecording(
    PHONE_CLIENT_ID,
    {
      id,
      startedAt,
      durationSeconds: Math.round(durationSeconds),
      mimeType: url.endsWith(".wav") ? "audio/wav" : "audio/mpeg",
      recordedBy: "phone",
    },
    bytes,
  );

  return Response.json({ ok: true });
}
