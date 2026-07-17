import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only the portal and login need a session. Everything else (marketing site,
  // blog, static assets) stays untouched so it can still be cached.
  matcher: ["/portal/:path*", "/login"],
};
