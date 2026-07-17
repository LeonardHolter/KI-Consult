import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ChatBotSettings, PromptSnapshot } from "./types";

const DEFAULT_BRANDING = {
  botName: "Assistenten",
  companyName: "",
  welcomeMessage: "Hei! Hvordan kan jeg hjelpe deg?",
  primaryColor: "#1e3b67",
  accentColor: "#1bade4",
  logoUrl: null as string | null,
  allowedOrigins: [] as string[],
};

export const DEFAULT_CHAT_BOT_SETTINGS: ChatBotSettings = {
  ...DEFAULT_BRANDING,
  instructions: "",
  knowledgeBase: "",
};

type Row = {
  bot_name: string;
  company_name: string;
  welcome_message: string;
  primary_color: string;
  accent_color: string;
  logo_url: string | null;
  allowed_origins: string[];
  instructions: string;
  knowledge_base: string;
  updated_at: string;
};

function rowToSettings(row: Row): ChatBotSettings & { updatedAt: string } {
  return {
    botName: row.bot_name,
    companyName: row.company_name,
    welcomeMessage: row.welcome_message,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_url,
    allowedOrigins: row.allowed_origins ?? [],
    instructions: row.instructions,
    knowledgeBase: row.knowledge_base,
    updatedAt: row.updated_at,
  };
}

/**
 * Public read (service-role, no session) for /api/chat and the embed.js
 * route — both are hit by anonymous website visitors. Returns null for an
 * unknown/unconfigured client so callers can 404 rather than silently
 * serving generic content under someone else's client id.
 */
export async function getChatBotSettingsPublic(clientId: string): Promise<ChatBotSettings | null> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("chat_bot_settings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    return data ? rowToSettings(data as Row) : null;
  } catch {
    return null;
  }
}

/** Admin-only read (RLS-scoped session client) for the tuner UI. */
export async function getChatBotSettingsAdmin(
  clientId: string,
): Promise<(ChatBotSettings & { updatedAt: string }) | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_bot_settings")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  return data ? rowToSettings(data as Row) : null;
}

export async function getChatBotPromptHistory(clientId: string): Promise<PromptSnapshot[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_bot_prompt_history")
    .select("instructions, knowledge_base, saved_at")
    .eq("client_id", clientId)
    .order("saved_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({
    instructions: r.instructions,
    knowledgeBase: r.knowledge_base,
    savedAt: r.saved_at,
  }));
}

/**
 * Admin-only write. Snapshots the previous instructions/knowledge base into
 * history first — only when either actually changed — then inserts (first
 * save for this client) or updates the row.
 */
export async function saveChatBotSettings(
  clientId: string,
  update: ChatBotSettings,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("chat_bot_settings")
    .select("instructions, knowledge_base")
    .eq("client_id", clientId)
    .maybeSingle();

  if (current && (current.instructions !== update.instructions || current.knowledge_base !== update.knowledgeBase)) {
    await supabase.from("chat_bot_prompt_history").insert({
      client_id: clientId,
      instructions: current.instructions,
      knowledge_base: current.knowledge_base,
    });
  }

  const row = {
    client_id: clientId,
    bot_name: update.botName,
    company_name: update.companyName,
    welcome_message: update.welcomeMessage,
    primary_color: update.primaryColor,
    accent_color: update.accentColor,
    logo_url: update.logoUrl,
    allowed_origins: update.allowedOrigins,
    instructions: update.instructions,
    knowledge_base: update.knowledgeBase,
    updated_at: new Date().toISOString(),
  };

  const { error } = current
    ? await supabase.from("chat_bot_settings").update(row).eq("client_id", clientId)
    : await supabase.from("chat_bot_settings").insert(row);

  return error ? { error: error.message } : {};
}
