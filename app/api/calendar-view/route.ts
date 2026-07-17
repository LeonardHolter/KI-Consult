import { NextRequest, NextResponse } from "next/server";
import { loadCalendarView } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client");
  if (!clientId) {
    return NextResponse.json({ error: "Mangler ?client=." }, { status: 400 });
  }
  const view = await loadCalendarView(clientId);
  return NextResponse.json(view);
}
