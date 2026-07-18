-- Production-readiness metrics: account/billing fields on clients, a
-- general bot_events table (deflections, errors, rate-limit trips, CORS
-- rejections — signals that were previously either invisible or only
-- discoverable by manually reading server logs), and voice_usage (the
-- voice agent currently has zero usage/cost tracking, unlike the chat bot).
--
-- Apply via the Supabase SQL editor, after 001-006.

-- ------------------------------------------------------------- clients --
alter table public.clients
  add column if not exists plan text,
  add column if not exists monthly_price_nok numeric,
  add column if not exists status text not null default 'trial'
    check (status in ('trial', 'active', 'paused', 'churned')),
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- --------------------------------------------------------- bot_events --
-- One row per notable event on either surface (chat or voice). Written
-- best-effort with the service-role key from the request path itself (same
-- fire-and-forget-but-via-after() pattern as portal-log.ts) — never on the
-- customer-facing critical path.
create table if not exists public.bot_events (
  id          bigserial primary key,
  client_id   uuid not null references public.clients(id) on delete cascade,
  surface     text not null check (surface in ('chat', 'voice')),
  type        text not null check (type in ('deflection', 'error', 'rate_limited', 'cors_rejected', 'tool_error')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists bot_events_client_recent_idx
  on public.bot_events (client_id, created_at desc);

alter table public.bot_events enable row level security;

drop policy if exists bot_events_admin_select on public.bot_events;
create policy bot_events_admin_select on public.bot_events
  for select using (public.is_admin());

-- ---------------------------------------------------------- voice_usage --
-- One row per completed voice-agent call (client's dashboard "Snakk med
-- agenten" button). Written by the client browser itself on hangup via
-- /api/portal/voice-agent/usage, since the actual WebRTC audio never
-- touches our backend — only the session-mint call does.
create table if not exists public.voice_usage (
  id                              bigserial primary key,
  client_id                       uuid not null references public.clients(id) on delete cascade,
  started_at                      timestamptz not null,
  ended_at                        timestamptz not null,
  duration_seconds                integer not null,
  input_tokens                    integer not null default 0,
  output_tokens                   integer not null default 0,
  cache_creation_input_tokens     integer not null default 0,
  cache_read_input_tokens         integer not null default 0,
  created_at                      timestamptz not null default now()
);

create index if not exists voice_usage_client_recent_idx
  on public.voice_usage (client_id, started_at desc);

alter table public.voice_usage enable row level security;

drop policy if exists voice_usage_admin_select on public.voice_usage;
create policy voice_usage_admin_select on public.voice_usage
  for select using (public.is_admin());

-- A client user may log their own calls (the dashboard button is used by
-- both roles), but never read anyone's usage — that stays admin-only.
drop policy if exists voice_usage_client_insert on public.voice_usage;
create policy voice_usage_client_insert on public.voice_usage
  for insert with check (client_id = public.my_client_id() or public.is_admin());

-- ---------------------------------------------------- aggregate views --
create or replace view public.client_voice_usage_stats
with (security_invoker = true) as
select
  client_id,
  count(*) as calls,
  coalesce(sum(duration_seconds), 0)::bigint as total_seconds,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_input_tokens,
  coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_input_tokens
from public.voice_usage
group by client_id;

grant select on public.client_voice_usage_stats to authenticated;

create or replace view public.client_event_counts_24h
with (security_invoker = true) as
select
  client_id,
  count(*) filter (where type = 'deflection') as deflections,
  count(*) filter (where type = 'error') as errors,
  count(*) filter (where type = 'tool_error') as tool_errors,
  count(*) filter (where type = 'rate_limited') as rate_limited,
  count(*) filter (where type = 'cors_rejected') as cors_rejected
from public.bot_events
where created_at > now() - interval '24 hours'
group by client_id;

grant select on public.client_event_counts_24h to authenticated;
