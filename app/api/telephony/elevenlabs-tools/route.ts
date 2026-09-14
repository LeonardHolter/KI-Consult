// Booking-tool executor for the ElevenLabs pilot agents (see
// lib/voiceDemo/elevenlabsAgents.ts). On a phone call there is no browser to
// run client tools, so the pilot agents' tools are registered hos ElevenLabs
// as WEBHOOK tools pointing here — ElevenLabs' servers call this route with
// the LLM-filled arguments and read the JSON response back to the model.
//
// Auth is a shared secret header (x-tools-secret), set on the ElevenLabs
// tool definitions and in ELEVENLABS_TOOLS_SECRET. Additionally the client
// must be in the pilot map — this route can never touch a non-pilot client,
// no matter what the URL says. The booking scope is decided server-side from
// the client's saved settings, exactly like /api/portal/voice-agent/tools.

import { execBookingTool, LOOKUP_VEHICLE_TOOL } from "@/lib/bookingTools";
import { loadSettings } from "@/lib/settings";
import { logBotEvent } from "@/lib/botEvents";
import { elevenlabsAgentIdFor } from "@/lib/voiceDemo/elevenlabsAgents";
import type { BookingScope } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_TOOLS_SECRET;
  if (!secret || req.headers.get("x-tools-secret") !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client");
  const tool = url.searchParams.get("tool");
  if (!clientId || !tool) return Response.json({ error: "missing_params" }, { status: 400 });
  if (!elevenlabsAgentIdFor(clientId)) {
    return Response.json({ error: "not_pilot_client" }, { status: 403 });
  }

  const args = await req.json().catch(() => ({}));

  // lookup_vehicle is a read-only registry lookup: it never reads or writes a
  // booking, so the scope it would be handed goes unused. Loading settings
  // anyway costs a Blob round trip on the ONE call the caller sits through in
  // silence — the agent confirms the plate, the customer says yes, and the
  // next turn opens with a tool call and no speech. Every hop removed there
  // is heard. Scope still decides live-vs-sandbox for every booking tool.
  const needsScope = tool !== LOOKUP_VEHICLE_TOOL;
  const scope: BookingScope = needsScope
    ? (await loadSettings(clientId)).voiceBookingMode === "live"
      ? "live"
      : "sandbox"
    : "live";

  const result = await execBookingTool(clientId, tool, args, scope);

  if (result.success === false || result.error) {
    await logBotEvent({
      clientId,
      surface: "voice",
      type: "tool_error",
      // Scope is omitted where it was never consulted, so the log does not
      // claim a booking mode this call never had.
      detail: {
        tool,
        ...(needsScope ? { scope } : {}),
        error: String(result.error ?? "unknown"),
        via: "elevenlabs-webhook",
      },
    });
  }

  return Response.json(result);
}
