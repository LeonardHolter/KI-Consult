import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_VOICE_DEMO_PROMPT } from "./defaultPrompt";
import type { PromptSnapshot, TurnDetectionConfig, VoiceDemoSettings } from "./types";

const DEFAULT_SETTINGS: VoiceDemoSettings = {
  model: "gpt-realtime",
  voice: "marin",
  speed: 1.0,
  turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
  noiseReduction: "near_field",
  transcriptionModel: "gpt-4o-transcribe",
  transcriptionLanguage: "no",
};

type Row = {
  model: string;
  voice: string;
  speed: number;
  turn_detection: TurnDetectionConfig;
  noise_reduction: "near_field" | "far_field" | "off";
  transcription_model: string;
  transcription_language: string;
  instructions: string;
  updated_at: string;
};

function rowToSettings(row: Row): VoiceDemoSettings & { instructions: string; updatedAt: string } {
  return {
    model: row.model,
    voice: row.voice,
    speed: row.speed,
    turnDetection: row.turn_detection,
    noiseReduction: row.noise_reduction,
    transcriptionModel: row.transcription_model,
    transcriptionLanguage: row.transcription_language,
    instructions: row.instructions,
    updatedAt: row.updated_at,
  };
}

/**
 * Read path for the public, unauthenticated /api/voice/session route. Falls
 * back to hardcoded defaults if the migration hasn't run yet or the row is
 * missing, so the marketing site's demo never hard-fails on this.
 */
export async function getVoiceDemoSettingsPublic(): Promise<
  VoiceDemoSettings & { instructions: string }
> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("voice_demo_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (data) return rowToSettings(data as Row);
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS, instructions: DEFAULT_VOICE_DEMO_PROMPT };
}

/** Admin-only read (RLS-scoped session client) for the tuner UI. */
export async function getVoiceDemoSettingsAdmin(): Promise<
  (VoiceDemoSettings & { instructions: string; updatedAt: string }) | null
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("voice_demo_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  return data ? rowToSettings(data as Row) : null;
}

export async function getVoiceDemoPromptHistory(): Promise<PromptSnapshot[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("voice_demo_prompt_history")
    .select("instructions, saved_at")
    .order("saved_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({ instructions: r.instructions, savedAt: r.saved_at }));
}

/**
 * Admin-only write. Snapshots the previous instructions into history first
 * — only when they actually changed, so pure settings tweaks don't create
 * history noise — then upserts the row.
 */
export async function saveVoiceDemoSettings(
  update: VoiceDemoSettings & { instructions: string },
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("voice_demo_settings")
    .select("instructions")
    .eq("id", "default")
    .maybeSingle();

  if (current && current.instructions !== update.instructions) {
    await supabase
      .from("voice_demo_prompt_history")
      .insert({ instructions: current.instructions });
  }

  const { error } = await supabase.from("voice_demo_settings").upsert({
    id: "default",
    model: update.model,
    voice: update.voice,
    speed: update.speed,
    turn_detection: update.turnDetection,
    noise_reduction: update.noiseReduction,
    transcription_model: update.transcriptionModel,
    transcription_language: update.transcriptionLanguage,
    instructions: update.instructions,
    updated_at: new Date().toISOString(),
  });

  return error ? { error: error.message } : {};
}
