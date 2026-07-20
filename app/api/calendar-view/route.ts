import { NextRequest, NextResponse } from "next/server";
import { loadCalendarView } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client");
  if (!clientId) {
    return NextResponse.json({ error: "Mangler ?client=." }, { status: 400 });
  }
  // ?scope=sandbox shows the isolated voice-testing calendar instead of the
  // real one. Read-only and harmless to expose: the sandbox store contains
  // only test bookings, and nothing here can write to it.
  const scope = req.nextUrl.searchParams.get("scope") === "sandbox" ? "sandbox" : "live";
  const view = await loadCalendarView(clientId, scope);
  return NextResponse.json(view);
}
