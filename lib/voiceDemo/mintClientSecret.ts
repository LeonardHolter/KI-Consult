import { realtimeToolDefs } from "@/lib/bookingTools";
import type { VoiceDemoSettings } from "./types";

/**
 * Shared OpenAI Realtime ephemeral-secret minting, used by all three session
 * routes (public marketing demo, admin draft-testing, per-client dashboard
 * button) so the session-shape logic lives in exactly one place.
 *
 * `withTools` attaches the booking tools. It's opt-in rather than always-on
 * because only the per-client dashboard agent has somewhere to execute them
 * (/api/portal/voice-agent/tools, which needs a portal session); the public
 * marketing demo is unauthenticated and must not advertise tools it cannot
 * run — OpenAI's realtime prompting guide is explicit that naming absent
 * tools degrades responses.
 */
/**
 * The voice prompt is stored statically in Supabase, so unlike the chat bot
 * (which rebuilds its system prompt per request) it has no idea what day it
 * is. Without this the agent cannot resolve "i morgen" / "på fredag" into the
 * YYYY-MM-DD the booking tool demands, and will confidently book the wrong
 * date. Prepended at mint time so every session gets the current Oslo clock.
 */
function dateContext(): string {
  const now = new Date();
  const opts = { timeZone: "Europe/Oslo" } as const;
  const iso = new Intl.DateTimeFormat("en-CA", {
    ...opts,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const label = new Intl.DateTimeFormat("no", {
    ...opts,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("no", {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return [
    "# DAGENS DATO OG KLOKKESLETT (Europe/Oslo)",
    "",
    `Det er ${label} (${iso}), klokken er nå ${time}.`,
    "Bruk ALLTID denne linjen — aldri egen hukommelse eller gjetning — når du",
    "regner ut hva «i dag», «i morgen», «på fredag» og lignende betyr.",
    "",
  ].join("\n");
}

export async function mintRealtimeClientSecret(
  settings: VoiceDemoSettings & { instructions: string },
  { withTools = false }: { withTools?: boolean } = {},
): Promise<
  | { ok: true; clientSecret: string; model: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: { error: "not_configured", message: "OPENAI_API_KEY mangler." },
    };
  }

  const session = {
    type: "realtime",
    model: settings.model,
    output_modalities: ["audio"],
    instructions: `${dateContext()}\n${settings.instructions}`,
    audio: {
      input: {
        transcription: {
          model: settings.transcriptionModel,
          ...(settings.transcriptionLanguage ? { language: settings.transcriptionLanguage } : {}),
        },
        turn_detection: settings.turnDetection,
        ...(settings.noiseReduction !== "off"
          ? { noise_reduction: { type: settings.noiseReduction } }
          : {}),
      },
      output: { voice: settings.voice, speed: settings.speed },
    },
    ...(withTools ? { tools: realtimeToolDefs(), tool_choice: "auto" } : {}),
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });

  const body = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: {
        error: "token_request_failed",
        message: body?.error?.message ?? "Kunne ikke opprette client secret",
        detail: body,
      },
    };
  }

  return { ok: true, clientSecret: body.value, model: session.model };
}
