import { redirect } from "next/navigation";
import { getClients, getProfile } from "@/lib/portal/data";
import {
  DEFAULT_SETTINGS,
  getVoiceAgentPromptHistory,
  getVoiceAgentSettingsForClient,
  getVoiceDemoPromptHistory,
  getVoiceDemoSettingsAdmin,
} from "@/lib/voiceDemo/data";
import { DEFAULT_VOICE_DEMO_PROMPT } from "@/lib/voiceDemo/defaultPrompt";
import VoiceDemoTuner from "./VoiceDemoTuner";

export const dynamic = "force-dynamic";

/**
 * Admin-only: tune a realtime voice agent live.
 * No ?client= — the public marketing site's tannlege demo.
 * ?client=<id> — that client's dashboard voice agent (e.g. Handz On).
 */
export default async function VoiceDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/portal");

  const { client: clientId } = await searchParams;

  let clientName: string | undefined;
  if (clientId) {
    const clients = await getClients();
    const client = clients.find((c) => c.id === clientId);
    if (!client) redirect("/portal");
    clientName = client.name;
  }

  const [settings, history] = clientId
    ? await Promise.all([getVoiceAgentSettingsForClient(clientId), getVoiceAgentPromptHistory(clientId)])
    : await Promise.all([getVoiceDemoSettingsAdmin(), getVoiceDemoPromptHistory()]);

  const initialSettings = settings ?? {
    ...DEFAULT_SETTINGS,
    instructions: DEFAULT_VOICE_DEMO_PROMPT,
    updatedAt: null,
  };

  return (
    <VoiceDemoTuner
      initialSettings={initialSettings}
      initialHistory={history}
      migrationApplied={settings !== null}
      clientId={clientId}
      clientName={clientName}
    />
  );
}
