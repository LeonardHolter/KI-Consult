import { redirect } from "next/navigation";
import { getProfile } from "@/lib/portal/data";
import { getVoiceDemoPromptHistory, getVoiceDemoSettingsAdmin } from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";
import VoiceDemoTuner from "./VoiceDemoTuner";

export const dynamic = "force-dynamic";

/** Admin-only: tune the public marketing site's realtime demo live. */
export default async function VoiceDemoPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/portal");

  const [settings, history] = await Promise.all([
    getVoiceDemoSettingsAdmin(),
    getVoiceDemoPromptHistory(),
  ]);

  const initialSettings = settings ?? {
    model: "gpt-realtime",
    voice: "marin",
    speed: 1.0,
    turnDetection: { type: "semantic_vad" as const, eagerness: "medium" as const, interrupt_response: true },
    noiseReduction: "near_field" as const,
    transcriptionModel: "gpt-4o-transcribe",
    transcriptionLanguage: "no",
    instructions: DEFAULT_VOICE_DEMO_PROMPT,
    updatedAt: null,
  };

  return (
    <VoiceDemoTuner
      initialSettings={initialSettings}
      initialHistory={history}
      migrationApplied={settings !== null}
    />
  );
}
