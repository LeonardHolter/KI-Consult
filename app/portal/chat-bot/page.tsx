import { redirect } from "next/navigation";
import { getClients, getProfile } from "@/lib/portal/data";
import { DEFAULT_CHAT_BOT_SETTINGS, getChatBotPromptHistory, getChatBotSettingsAdmin } from "@/lib/chatBot/data";
import ChatBotTuner from "./ChatBotTuner";

export const dynamic = "force-dynamic";

/** Admin-only: configure a client's text chat bot (branding, prompt, embed). */
export default async function ChatBotPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/portal");

  const { client: clientId } = await searchParams;
  if (!clientId) redirect("/portal");

  const clients = await getClients();
  const client = clients.find((c) => c.id === clientId);
  if (!client) redirect("/portal");

  const [settings, history] = await Promise.all([
    getChatBotSettingsAdmin(clientId),
    getChatBotPromptHistory(clientId),
  ]);

  const initialSettings = settings ?? {
    ...DEFAULT_CHAT_BOT_SETTINGS,
    companyName: client.name,
    updatedAt: null,
  };

  return (
    <ChatBotTuner
      clientId={clientId}
      clientName={client.name}
      initialSettings={initialSettings}
      initialHistory={history}
      configured={settings !== null}
    />
  );
}
