-- Per-client bot connection details for the portal's dashboard proxy.
--
-- These live in their own table rather than as columns on `clients` for one
-- reason: `clients` has a SELECT policy that lets a client user read their own
-- row, so an `admin_secret` column there would hand the secret straight to the
-- customer it's meant to be hidden from.
--
-- This table has RLS enabled and *no policies at all*, which means no anon or
-- authenticated token can read it under any circumstance. Only the service-role
-- key — used server-side by the proxy route — can, because it bypasses RLS.

create table if not exists public.client_secrets (
  client_id     uuid primary key references public.clients on delete cascade,
  -- Origin of that client's bot deployment, no trailing slash.
  bot_base_url  text not null,
  -- Value the bot expects in the x-admin-key header (its AGENT_TOOL_SECRET).
  admin_secret  text,
  updated_at    timestamptz not null default now()
);

alter table public.client_secrets enable row level security;
-- Intentionally no policies. Service role only.

insert into public.client_secrets (client_id, bot_base_url, admin_secret)
select c.id, 'https://handzon-voice-demo.vercel.app', null
from public.clients c
where c.slug = 'handzon-strommen'
on conflict (client_id) do update
  set bot_base_url = excluded.bot_base_url;
