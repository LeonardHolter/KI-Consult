// Mints a short-lived WebRTC conversation token for the ElevenLabs
// Conversational AI agent. The secret API key stays on the server — the
// browser only ever receives the single-use token.

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      {
        error: "not_configured",
        message:
          "Sett ELEVENLABS_API_KEY og ELEVENLABS_AGENT_ID i .env.local for å aktivere live-demoen.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: "token_request_failed", status: res.status, detail },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      return Response.json({ error: "missing_token" }, { status: 502 });
    }

    return Response.json({ token: data.token });
  } catch (err) {
    return Response.json(
      { error: "unexpected", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
