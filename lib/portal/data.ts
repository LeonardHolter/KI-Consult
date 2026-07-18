import { createClient } from "@/lib/supabase/server";

/**
 * Read helpers for the portal.
 *
 * Every query here runs through the session-scoped Supabase client, so RLS
 * silently narrows the results to whatever the caller is allowed to see: an
 * admin gets every client's rows, a client user only their own. That means
 * these functions need no `where client_id = ...` of their own — and can't
 * leak by forgetting one.
 */

export type Profile = {
  id: string;
  client_id: string | null;
  role: "admin" | "client";
  full_name: string | null;
};

export type Client = {
  id: string;
  slug: string;
  name: string;
  plan: string | null;
  monthly_price_nok: number | null;
  status: "trial" | "active" | "paused" | "churned";
  contact_email: string | null;
  contact_phone: string | null;
};

export type ConversationRow = {
  id: string;
  client_id: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  booked: boolean;
};

export type MessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type UsageStats = {
  client_id: string;
  conversations: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, client_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

/** Clients the caller may see: all of them for an admin, one for a client user. */
export async function getClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug, name, plan, monthly_price_nok, status, contact_email, contact_phone")
    .order("name");

  // The billing columns (supabase/007) are additive and may not exist yet on
  // a deployment where that migration hasn't run — fall back to the base
  // columns rather than letting the whole admin overview (and everything
  // else that calls this) silently render as "no clients".
  if (error) {
    const fallback = await supabase.from("clients").select("id, slug, name").order("name");
    return ((fallback.data ?? []) as Pick<Client, "id" | "slug" | "name">[]).map((c) => ({
      ...c,
      plan: null,
      monthly_price_nok: null,
      status: "trial" as const,
      contact_email: null,
      contact_phone: null,
    }));
  }

  return (data as Client[]) ?? [];
}

export async function getConversations(clientId?: string): Promise<ConversationRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("conversations")
    .select("id, client_id, started_at, last_message_at, message_count, booked")
    .order("last_message_at", { ascending: false })
    .limit(200);
  // Admins browse one client at a time; for client users RLS already scopes it.
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data as ConversationRow[]) ?? [];
}

/** Per-client token totals, from the client_usage_stats view (see supabase/003_usage_tracking.sql). */
export async function getUsageStats(): Promise<UsageStats[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_usage_stats").select("*");
  return (data as UsageStats[]) ?? [];
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return (data as MessageRow[]) ?? [];
}
