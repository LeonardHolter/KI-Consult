// Post-call webhook for the ElevenLabs agents: fires once a conversation is
// over, carrying the whole transcript. That is the only moment a complete
// transcript exists — the shop's summary mail goes out from request_callback
// while the agent is still on the line — so the transcript arrives as its own
// follow-up mail, subject-matched to the summary by phone number.
//
// Auth is ElevenLabs' HMAC signature (ELEVENLABS_WEBHOOK_SECRET), not the
// shared header the tool webhook uses: this endpoint is called by ElevenLabs'
// own infrastructure, and a signature is the only thing that proves it.
//
// Fails CLOSED and quietly: an unverified or unknown call is dropped with a
// 2xx where the sender should not retry, because there is nothing a retry
// would fix, and 4xx storms in ElevenLabs' dashboard hide real problems.

import {
  verifyElevenLabsWebhook,
  formatTranscript,
  hasCallback,
  type TranscriptTurn,
} from "@/lib/telephony/postCall";
import { clientIdForElevenlabsAgent } from "@/lib/voiceDemo/elevenlabsAgents";
import { normalizeNumber } from "@/lib/telephony/numbers";
import { notifyShop } from "@/lib/notify";
import { loadSettings } from "@/lib/settings";
import { osloParts } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[post-call] ELEVENLABS_WEBHOOK_SECRET ikke satt — ignorerer webhook");
    return Response.json({ ok: true, skipped: "not_configured" });
  }

  // Raw body, not req.json(): the signature covers the exact bytes sent, and
  // re-serializing a parsed object would not reproduce them.
  const raw = await req.text();
  const verified = verifyElevenLabsWebhook(
    raw,
    req.headers.get("elevenlabs-signature"),
    secret,
  );
  if (!verified.ok) {
    console.warn(`[post-call] avvist signatur: ${verified.reason}`);
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = verified.payload as {
    type?: string;
    data?: {
      agent_id?: string;
      conversation_id?: string;
      transcript?: TranscriptTurn[];
      metadata?: {
        call_duration_secs?: number;
        phone_call?: { external_number?: string };
      };
    };
  };

  if (body.type !== "post_call_transcription") {
    return Response.json({ ok: true, skipped: "other_event" });
  }

  const data = body.data ?? {};
  const clientId = clientIdForElevenlabsAgent(data.agent_id);
  if (!clientId) {
    // An agent outside the pilot map: not ours to mail about.
    return Response.json({ ok: true, skipped: "unknown_agent" });
  }

  // No enquiry, no mail. Hangups, wrong numbers and line tests would
  // otherwise bury the real conversations — and Resend's daily cap is shared
  // across every client.
  if (!hasCallback(data.transcript)) {
    return Response.json({ ok: true, skipped: "no_callback" });
  }

  const lines = formatTranscript(data.transcript);
  if (lines.length === 0) {
    return Response.json({ ok: true, skipped: "empty_transcript" });
  }

  const settings = await loadSettings(clientId);
  const now = osloParts(new Date().toISOString());
  const external = data.metadata?.phone_call?.external_number;

  await notifyShop(clientId, {
    kind: "transcript",
    date: now.date,
    time: now.time,
    // Browser sessions have no external number; say so rather than printing
    // an empty field the reader has to interpret.
    customerPhone: external ? normalizeNumber(external) : "nettleser-demo",
    transcript: lines,
    durationSecs: data.metadata?.call_duration_secs,
    scope: settings.voiceBookingMode === "live" ? "live" : "sandbox",
  });

  return Response.json({ ok: true, turns: lines.length });
}
