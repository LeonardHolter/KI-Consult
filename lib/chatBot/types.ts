// Per-client chat bot configuration — mirrors lib/voiceDemo/types.ts's
// approach for the realtime voice agent, but for the text chat widget.

export type ChatBotBranding = {
  botName: string;
  companyName: string;
  welcomeMessage: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  allowedOrigins: string[];
};

export type ChatBotSettings = ChatBotBranding & {
  instructions: string;
  knowledgeBase: string;
};

export type PromptSnapshot = {
  instructions: string;
  knowledgeBase: string;
  savedAt: string;
};
