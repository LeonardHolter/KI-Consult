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

// The original line, wired before the number->client map existed. Calls to a
// number with no assignment fall back to PHONE_CLIENT_ID, which keeps this
// number working without a mapping row. Display + "already taken" logic on
// the Integrasjoner page also use it.
export const DEFAULT_PHONE_NUMBER = "+47 32 99 42 23";

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

/** Appends the caller's number (parsed from the SIP From header) to the
 *  instructions, so a prompt can offer «Kan vi nå deg på nummeret du ringer
 *  fra?» instead of taking a number by ear. Pure and exported for tests.
 *
 *  The framing in the block matters: this number comes from the phone
 *  system, NOT from transcription — so the prompt is told it never needs
 *  the digit-by-digit read-back that spoken numbers require. That skip is
 *  the whole reliability win. Anonymous callers (no plausible From) get no
 *  block, and a prompt written for this flow falls back to asking. */
export function withCallerNumber(instructions: string, callerDigits: string | null): string {
  if (!callerDigits) return instructions;
  return (
    instructions +
    `\n\n# SYSTEMINFO FRA TELEFONSYSTEMET\n` +
    `Innringerens telefonnummer er +${callerDigits}. Nummeret er hentet fra telefonsystemet og er pålitelig — det skal ALDRI leses opp siffer for siffer eller bekreftes på den måten. Følger instruksjonene over en «nummeret du ringer fra»-flyt, er det DETTE nummeret som skal brukes som kundens telefonnummer.`
  );
}

export const TRANSFER_CALL_TOOL = "transfer_call";

/** Phone-only tool: hands the call over to a human. The actual SIP REFER is
 *  performed by the call runner (callSession.ts) — the model only signals
 *  intent. Registered only when the client has a transferPhoneNumber, so the
 *  browser demo and non-configured clients never see a tool they can't use. */
export function transferCallToolDef() {
  return {
    type: "function" as const,
    name: TRANSFER_CALL_TOOL,
    description:
      "Setter samtalen over til kundemottaket (et menneske). Bruk KUN når kunden ber om å snakke med et menneske, eller instruksene dine sier at samtalen skal overføres. Si en kort setning om at du setter over FØR du kaller verktøyet — overføringen skjer når replikken er ferdig spilt.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  };
}

/** Loads the client's live voice agent config for the phone bridge. Uses the
 *  service role because a webhook has no portal session to scope by.
 *  `callerDigits` (from the SIP From header) is appended to the prompt so
 *  number-confirmation flows can use it — null for anonymous callers. */
export async function loadPhoneAgent(clientId: string, callerDigits: string | null = null): Promise<{
  session: ReturnType<typeof buildRealtimeSession>;
  scope: BookingScope;
  /** E.164 target for transfer_call, or null when the tool is not offered. */
  transferTo: string | null;
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
    instructions: withCallerNumber(row.instructions, callerDigits),
  };

  // Same booking store the dashboard agent uses — sandbox while testing, live
  // once the client flips it. A real caller must never be told a slot is
  // booked when it only landed in the sandbox, so this is server-decided.
  const clientSettings = await loadSettings(clientId);
  const scope = clientSettings.voiceBookingMode;
  const transferTo = clientSettings.transferPhoneNumber?.trim() || null;

  const session = buildRealtimeSession(settings, { withTools: true });
  if (transferTo) {
    (session as { tools?: unknown[] }).tools = [
      ...((session as { tools?: unknown[] }).tools ?? []),
      transferCallToolDef(),
    ];
  }
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
    // 700 made the agent jump into the caller's THINKING pauses — people
    // dictating a reg.nr or km-stand pause longer than 700ms mid-utterance.
    // A flat second of patience costs 300ms extra response latency per turn
    // and buys back every "no wait, I wasn't done" repair loop.
    silence_duration_ms: 1000,
    interrupt_response: false, // never cut the agent mid-turn
  };

  return { session, scope, transferTo };
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
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      textInputTokens?: number;
      audioInputTokens?: number;
      audioOutputTokens?: number;
    };
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
      text_input_tokens: summary.usage.textInputTokens ?? 0,
      audio_input_tokens: summary.usage.audioInputTokens ?? 0,
      audio_output_tokens: summary.usage.audioOutputTokens ?? 0,
    });
  } catch {
    /* best-effort */
  }
}
