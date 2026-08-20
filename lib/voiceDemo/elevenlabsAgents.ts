// Which clients' dashboard voice agent runs on ElevenLabs Agents instead of
// OpenAI Realtime. Pilot for evaluating a platform switch — the agent config
// (prompt, gpt-4.1, norsk stemme, turtaking) lives hos ElevenLabs and is
// tuned from the ~/code/ellevenlabs-test rig, NOT from the voice-demo tuner.
// Every client NOT in this map keeps the OpenAI path untouched.
export const ELEVENLABS_VOICE_AGENTS: Record<string, string> = {
  // test_kunde — ElevenLabs-pilot, klon av Handz On-agenten (2026-08-19)
  "18c22e0d-95f6-4a34-aac6-621281771364": "agent_4501m0dkd810f17vwptaqbbsv40q",
  // Handz On Strømmen — produksjon, flyttet fra OpenAI Realtime 2026-08-20
  // etter pilotuka. Linjen +47 32 99 42 23 og verktøyene svitsjer med denne
  // linjen; fjern den for øyeblikkelig rollback til OpenAI-agenten.
  "ad19951e-00e1-4293-8975-6c6bb1dbdad7": "agent_6301m0fs6p40feyaev39cv3qnn6c",
};

export function elevenlabsAgentIdFor(clientId: string | null | undefined): string | null {
  return clientId ? (ELEVENLABS_VOICE_AGENTS[clientId] ?? null) : null;
}
