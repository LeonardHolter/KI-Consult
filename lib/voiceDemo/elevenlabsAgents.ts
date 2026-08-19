// Which clients' dashboard voice agent runs on ElevenLabs Agents instead of
// OpenAI Realtime. Pilot for evaluating a platform switch — the agent config
// (prompt, gpt-4.1, norsk stemme, turtaking) lives hos ElevenLabs and is
// tuned from the ~/code/ellevenlabs-test rig, NOT from the voice-demo tuner.
// Every client NOT in this map keeps the OpenAI path untouched.
export const ELEVENLABS_VOICE_AGENTS: Record<string, string> = {
  // test_kunde — ElevenLabs-pilot, klon av Handz On-agenten (2026-08-19)
  "18c22e0d-95f6-4a34-aac6-621281771364": "agent_4501m0dkd810f17vwptaqbbsv40q",
};

export function elevenlabsAgentIdFor(clientId: string | null | undefined): string | null {
  return clientId ? (ELEVENLABS_VOICE_AGENTS[clientId] ?? null) : null;
}
