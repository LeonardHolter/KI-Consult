import { getProfile } from "@/lib/portal/data";
import {
  getVoiceDemoPromptHistory,
  getVoiceDemoSettingsAdmin,
  saveVoiceDemoSettings,
} from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const [settings, history] = await Promise.all([
    getVoiceDemoSettingsAdmin(),
    getVoiceDemoPromptHistory(),
  ]);

  return Response.json({
    settings: settings ?? {
      model: "gpt-realtime",
      voice: "marin",
      speed: 1.0,
      turnDetection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
      noiseReduction: "near_field",
      transcriptionModel: "gpt-4o-transcribe",
      transcriptionLanguage: "no",
      instructions: DEFAULT_VOICE_DEMO_PROMPT,
      updatedAt: null,
    },
    history,
    // True when we fell back to defaults because the migration hasn't run yet.
    migrationApplied: settings !== null,
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.instructions !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await saveVoiceDemoSettings({
    model: body.model,
    voice: body.voice,
    speed: body.speed,
    turnDetection: body.turnDetection,
    noiseReduction: body.noiseReduction,
    transcriptionModel: body.transcriptionModel,
    transcriptionLanguage: body.transcriptionLanguage,
    instructions: body.instructions,
  });

  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}
