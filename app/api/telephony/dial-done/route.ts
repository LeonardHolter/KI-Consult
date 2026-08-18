// The <Dial action> callback: Telnyx POSTs here when the OpenAI agent leg
// ends, and our response REPLACES the rest of the TeXML document. Two cases:
//
//  - The call runner set a transfer marker for this call's key (the caller
//    asked for a human, the agent said its hand-off line and hung up): dial
//    the human. Caller ID is our own line — the workshop's staff see the
//    business number, and Telnyx will always accept it as CLI.
//  - No marker (the normal end of every other call): hang up, exactly what
//    the document did before this callback existed.
//
// The marker is take-once, so Telnyx retrying this webhook can't double-dial.

import { takeTransfer } from "@/lib/telephony/transferStore";
import { xml } from "@/lib/telephony/texml";

export const dynamic = "force-dynamic";

function transferDialTexml(target: string, callerId: string | null): string {
  const callerAttr = callerId ? ` callerId="${xml(callerId)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${callerAttr}>${xml(target)}</Dial>
</Response>`;
}

const HANGUP = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

async function respond(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const dialed = url.searchParams.get("dialed");
  const target = await takeTransfer(key);
  console.info("[telnyx-dial-done]", {
    key: key ? key.slice(0, 8) : "(ingen)",
    outcome: target ? `transfer -> ${target}` : "hangup",
  });
  if (!target) {
    return new Response(HANGUP, { status: 200, headers: { "Content-Type": "application/xml" } });
  }
  return new Response(transferDialTexml(target, dialed), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

export async function POST(req: Request) {
  return respond(req);
}

export async function GET(req: Request) {
  return respond(req);
}
