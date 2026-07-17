import { getProfile } from "@/lib/portal/data";
import {
  DEFAULT_CHAT_BOT_SETTINGS,
  getChatBotPromptHistory,
  getChatBotSettingsAdmin,
  saveChatBotSettings,
} from "@/lib/chatBot/data";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const clientId = new URL(req.url).searchParams.get("client");
  if (!clientId) return Response.json({ error: "missing_client" }, { status: 400 });

  const [settings, history] = await Promise.all([
    getChatBotSettingsAdmin(clientId),
    getChatBotPromptHistory(clientId),
  ]);

  return Response.json({
    settings: settings ?? { ...DEFAULT_CHAT_BOT_SETTINGS, updatedAt: null },
    history,
    configured: settings !== null,
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string" || typeof body.instructions !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await saveChatBotSettings(body.clientId, {
    botName: body.botName,
    companyName: body.companyName,
    welcomeMessage: body.welcomeMessage,
    primaryColor: body.primaryColor,
    accentColor: body.accentColor,
    logoUrl: body.logoUrl || null,
    allowedOrigins: Array.isArray(body.allowedOrigins) ? body.allowedOrigins : [],
    instructions: body.instructions,
    knowledgeBase: body.knowledgeBase ?? "",
  });

  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}
