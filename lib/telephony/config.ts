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

  return { session: buildRealtimeSession(settings, { withTools: true }), scope };
}
