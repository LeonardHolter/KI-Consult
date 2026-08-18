// The pre-roll <Gather>'s action: Telnyx POSTs here when the caller pressed
// a digit during/after the recording notice. Digit 1 = the caller objected
// to recording, so the dial goes out WITHOUT record attributes — the
// recording never starts, which is a stronger answer to the objection than
// any delete-later promise. Any other digit (misdials happen) gets the
// normal recorded dial, same as not pressing at all.
//
// client/dialed ride on the query string, put there by telnyx-inbound — the
// same pattern as the recording callback, and for the same reason: this
// request carries nothing else that says which line rang.

import { baseUrl, gatherResponseTexml } from "@/lib/telephony/texml";

export const dynamic = "force-dynamic";

async function digitsFrom(req: Request): Promise<string> {
  try {
    const form = await req.formData();
    const d = form.get("Digits");
    return typeof d === "string" ? d : "";
  } catch {
    return new URL(req.url).searchParams.get("Digits") ?? "";
  }
}

async function respond(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client");
  const dialed = url.searchParams.get("dialed");
  const digits = await digitsFrom(req);
  console.info("[telnyx-gather]", {
    digits: digits || "(ingen)",
    recording: digits.trim() === "1" ? "AV — innringer reserverte seg" : "på",
    client: clientId ?? "default",
  });
  return new Response(
    gatherResponseTexml({ base: baseUrl(req), dialed, clientId, digits }),
    { status: 200, headers: { "Content-Type": "application/xml" } },
  );
}

export async function POST(req: Request) {
  return respond(req);
}

export async function GET(req: Request) {
  return respond(req);
}
