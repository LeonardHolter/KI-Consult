import { createServiceClient } from "@/lib/supabase/service";
import { loadSettings } from "@/lib/settings";
import { buildRealtimeSession } from "@/lib/voiceDemo/mintClientSecret";
import type { BookingScope } from "@/lib/slots";
import type { VoiceDemoSettings } from "@/lib/voiceDemo/types";

// Which client answers the phone line. For now this is a single number ->
// single client mapping; when a second client gets a number, turn this into a
// number -> client_id lookup (Telnyx passes the dialed number in the SIP
// headers, surfaced on the realtime.call.incoming event).
export const PHONE_CLIENT_ID = "ad19951e-00e1-4293-8975-6c6bb1dbdad7"; // Handz On Strømmen

// OpenAI Realtime SIP endpoint. The user part is the OpenAI PROJECT id — that
// is how OpenAI routes an inbound INVITE to the right project + webhook.
// Not a secret (it's an identifier, like a bucket name); overridable by env
// if the project ever changes. `sip.api.openai.com` over TLS per OpenAI's SIP
// guide — NOT sip.openai.com.
export const OPENAI_SIP_URI =
  process.env.OPENAI_SIP_URI ??
  "sip:proj_Acg1pm1jVY2qiqEWf01Al8S3@sip.api.openai.com;transport=tls";

type SettingsRow = {
  model: string;
  voice: string;
  speed: number;
  turn_detection: VoiceDemoSettings["turnDetection"];
  noise_reduction: VoiceDemoSettings["noiseReduction"];
  transcription_model: string;
  transcription_language: string;
  instructions: string;
};

/** Loads the client's live voice agent config for the phone bridge. Uses the
 *  service role because a webhook has no portal session to scope by. */
export async function loadPhoneAgent(clientId: string): Promise<{
  session: ReturnType<typeof buildRealtimeSession>;
  scope: BookingScope;
} | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("voice_demo_settings")
    .select("model, voice, speed, turn_detection, noise_reduction, transcription_model, transcription_language, instructions")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  const row = data as SettingsRow;

  const settings: VoiceDemoSettings & { instructions: string } = {
    model: row.model,
    voice: row.voice,
    speed: row.speed,
    turnDetection: row.turn_detection,
    noiseReduction: row.noise_reduction,
    transcriptionModel: row.transcription_model,
    transcriptionLanguage: row.transcription_language,
    instructions: row.instructions,
  };

  // Same booking store the dashboard agent uses — sandbox while testing, live
  // once the client flips it. A real caller must never be told a slot is
  // booked when it only landed in the sandbox, so this is server-decided.
  const scope = (await loadSettings(clientId)).voiceBookingMode;

  const session = buildRealtimeSession(settings, { withTools: true });
  // PHONE-ONLY turn detection. Call logs confirmed the agent's own audio
  // echoes back over the SIP leg (no line-side echo cancellation, unlike the
  // browser mic) and gets heard as the caller, cancelling the response
  // mid-sentence (response.done status:cancelled, reason:turn_detected). And
  // interrupt_response:false is NOT reliably honored by semantic_vad — the
  // greeting still got cut on ~1/3 of calls, then the truncation raced the
  // auto-response into a conversation_already_has_active_response error.
  //
  // server_vad is the telephony-standard fix: a higher energy threshold
  // rejects the attenuated echo, and interrupt_response:false IS honored here,
  // so the agent finishes each turn. The browser keeps its own semantic_vad
  // (echo-cancelled mic, barge-in works there) — this override is phone-only.
  const input = session.audio.input as { turn_detection?: unknown };
  input.turn_detection = {
    type: "server_vad",
    threshold: 0.65, // above the echo level, below full-volume caller speech
    prefix_padding_ms: 300,
    silence_duration_ms: 700,
    interrupt_response: false, // never cut the agent mid-turn
  };

  return { session, scope };
}

/** Records a finished phone call's duration + token usage into voice_usage —
 *  the same table the dashboard agent writes to, so phone calls show up in
 *  the admin cost figures and activity graphs. Service role: a webhook has no
 *  portal session. Best-effort; a failed insert must not affect the call. */
export async function recordPhoneUsage(
  clientId: string,
  summary: {
    startedAt: number;
    endedAt: number;
    durationSeconds: number;
    usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
  },
): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("voice_usage").insert({
      client_id: clientId,
      started_at: new Date(summary.startedAt).toISOString(),
      ended_at: new Date(summary.endedAt).toISOString(),
      duration_seconds: Math.max(0, Math.round(summary.durationSeconds)),
      input_tokens: summary.usage.inputTokens,
      output_tokens: summary.usage.outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: summary.usage.cacheReadInputTokens,
    });
  } catch {
    /* best-effort */
  }
}
