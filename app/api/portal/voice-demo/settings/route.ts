import { getProfile } from "@/lib/portal/data";
import {
  DEFAULT_SETTINGS,
  getVoiceAgentPromptHistory,
  getVoiceAgentSettingsForClient,
  getVoiceDemoPromptHistory,
  getVoiceDemoSettingsAdmin,
  saveVoiceAgentSettings,
  saveVoiceDemoSettings,
} from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

// With no ?client= param this tunes the marketing site's tannlege demo
// (fixed row id "default"); with one, it tunes that client's dashboard
// voice agent instead. Both are admin-only.

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const clientId = new URL(req.url).searchParams.get("client");

  const [settings, history] = clientId
    ? await Promise.all([getVoiceAgentSettingsForClient(clientId), getVoiceAgentPromptHistory(clientId)])
    : await Promise.all([getVoiceDemoSettingsAdmin(), getVoiceDemoPromptHistory()]);

  return Response.json({
    settings: settings ?? {
      ...DEFAULT_SETTINGS,
      instructions: DEFAULT_VOICE_DEMO_PROMPT,
      updatedAt: null,
    },
    history,
    // True when we fell back to defaults — either the migration hasn't run
    // yet, or (client case) this client hasn't been customized yet.
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

  const update = {
    model: body.model,
    voice: body.voice,
    speed: body.speed,
    turnDetection: body.turnDetection,
    noiseReduction: body.noiseReduction,
    transcriptionModel: body.transcriptionModel,
    transcriptionLanguage: body.transcriptionLanguage,
    instructions: body.instructions,
  };

  const result =
    typeof body.clientId === "string"
      ? await saveVoiceAgentSettings(body.clientId, update)
      : await saveVoiceDemoSettings(update);

  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}
