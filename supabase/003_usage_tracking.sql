-- Token usage + cost tracking for the admin overview.
--
-- Tokens are stored per-message (on the assistant row only — one per turn,
-- summed across every model call that turn made, including tool-use rounds)
-- rather than accumulated on `conversations`. That avoids a read-modify-write
-- race on the conversation row: the bot's logging is a single INSERT with no
-- prior read, same as the rest of portal-log.ts.
--
-- Cost itself is NOT stored — pricing changes over time and per model, so it's
-- computed at render time from the raw token counts. Storing a derived dollar
-- figure would go stale the moment pricing changes; the tokens never do.

alter table public.messages
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists cache_creation_input_tokens integer,
  add column if not exists cache_read_input_tokens integer;

-- Per-client token totals, for the admin overview. `security_invoker` makes
-- the view respect the *querying* user's RLS, not the view owner's — so this
-- is exactly as safe to query as `messages`/`conversations` directly: an
-- admin sees every client, a client account sees only their own row.
create or replace view public.client_usage_stats
with (security_invoker = true) as
select
  c.client_id,
  count(distinct c.id) as conversations,
  coalesce(sum(m.input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(m.output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(m.cache_creation_input_tokens), 0)::bigint as cache_creation_input_tokens,
  coalesce(sum(m.cache_read_input_tokens), 0)::bigint as cache_read_input_tokens
from public.conversations c
left join public.messages m on m.conversation_id = c.id
group by c.client_id;

-- Explicit, rather than relying on default-privilege inheritance for a new
-- relation. security_invoker still means the actual rows returned are
-- exactly what the querying role's RLS on conversations/messages allows.
grant select on public.client_usage_stats to authenticated, anon;
