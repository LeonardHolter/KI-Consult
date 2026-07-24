// Inbound phone bridge: OpenAI POSTs `realtime.call.incoming` here when a call
// arrives on the SIP number (Telnyx -> OpenAI SIP -> this webhook). We verify
// the signature, accept the call with Handz On's live session config, and run
// the call server-side via Next's after() so the HTTP response returns at once
// while the conversation continues.
//
// The number is wired to this endpoint LAST (Telnyx SIP connection -> OpenAI
// project SIP address), and only after a test call. Until then this route is
// dormant — deploying it changes nothing customer-facing.

import { after } from "next/server";
import { verifyOpenAIWebhook } from "@/lib/telephony/verifyWebhook";
import { loadPhoneAgent, PHONE_CLIENT_ID } from "@/lib/telephony/config";
import { runCallSession } from "@/lib/telephony/callSession";

export const dynamic = "force-dynamic";
// A phone call outlives a normal request; keep the function alive for the
// after() call handler. Vercel Pro + Fluid Compute honors this up to its
// ceiling; runCallSession also caps itself at 15 min.
export const maxDuration = 800;

export async function POST(req: Request) {
  const secret = process.env.OPENAI_WEBHOOK_SECRET;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!secret || !apiKey) {
    // 500 (not 400) so OpenAI retries once we're configured, rather than
    // treating it as a permanent rejection.
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const verified = verifyOpenAIWebhook(
    rawBody,
    {
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signature: req.headers.get("webhook-signature"),
    },
    secret,
  );
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 401 });
  }

  const event = verified.payload as {
    type?: string;
    data?: { call_id?: string };
  };

  // Only inbound calls matter here; ack everything else so OpenAI stops
  // retrying it.
  if (event.type !== "realtime.call.incoming" || !event.data?.call_id) {
    return Response.json({ ok: true });
  }
  const callId = event.data.call_id;

  const agent = await loadPhoneAgent(PHONE_CLIENT_ID);
  if (!agent) {
    return Response.json({ error: "no_agent_config" }, { status: 500 });
  }

  // Accept the call with the full Handz On session (prompt + booking tools).
  const acceptRes = await fetch(
    `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(agent.session),
    },
  );
  if (!acceptRes.ok) {
    return Response.json(
      { error: "accept_failed", status: acceptRes.status, detail: (await acceptRes.text()).slice(0, 300) },
      { status: 502 },
    );
  }

  // Run the conversation after the response returns.
  after(
    runCallSession({
      callId,
      apiKey,
      clientId: PHONE_CLIENT_ID,
      scope: agent.scope,
      withTools: true,
      log: (note, detail) => console.info(`[phone ${callId.slice(0, 8)}] ${note}`, detail ?? ""),
    }),
  );

  return Response.json({ ok: true });
}
