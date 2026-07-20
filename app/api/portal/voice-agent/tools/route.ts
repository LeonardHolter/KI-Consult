// Executes a booking tool call on behalf of the voice agent.
//
// The Realtime session is a direct browser<->OpenAI WebRTC connection, so tool
// calls surface in the *browser*, not on our server. VoiceAgentCard forwards
// them here, we run them against the same shared implementation the chat bot
// uses (lib/bookingTools.ts), and the browser returns the output to OpenAI over
// the data channel.
//
// Two things this route is careful about:
//
//   1. The browser never chooses the booking scope. It comes from the client's
//      saved Settings.voiceBookingMode, read server-side. Otherwise anyone with
//      a portal login could post scope:"live" and write to the real calendar.
//
//   2. A client-role user is pinned to their own client_id regardless of what
//      they send — same boundary as the /api/bot proxy. Only an admin may
//      target another client, and only by naming it explicitly.

import { getProfile } from "@/lib/portal/data";
import { execBookingTool } from "@/lib/bookingTools";
import { loadSettings } from "@/lib/settings";
import { logBotEvent } from "@/lib/botEvents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return Response.json({ error: "missing_tool_name" }, { status: 400 });
  }

  const clientId = profile.role === "admin" ? body.clientId : profile.client_id;
  if (!clientId || typeof clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }

  // Server-side decision, never the caller's.
  const settings = await loadSettings(clientId);
  const scope = settings.voiceBookingMode === "live" ? "live" : "sandbox";

  const result = await execBookingTool(clientId, body.name, body.arguments, scope);

  // Surface tool failures on the admin event log, the same way the chat route
  // does — a voice agent silently failing to book is exactly the kind of thing
  // nobody notices until a customer complains.
  if (result.success === false || result.error) {
    await logBotEvent({
      clientId,
      surface: "voice",
      type: "tool_error",
      detail: { tool: body.name, scope, error: String(result.error ?? "unknown") },
    });
  }

  return Response.json({ result, scope });
}
