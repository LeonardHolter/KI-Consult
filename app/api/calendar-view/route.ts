import { NextResponse } from "next/server";
import { loadCalendarView } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const view = await loadCalendarView();
  return NextResponse.json(view);
}
