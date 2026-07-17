import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-only code that must read regardless of RLS
 * — e.g. the public marketing page's /api/voice/session route, which has no
 * logged-in user to scope by. Same key the bot already uses for its writes.
 * Never import this into client code.
 */
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}
