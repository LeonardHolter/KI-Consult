-- KI Consult client portal — schema + tenant isolation.
--
-- Model: one row in `clients` per customer business (Handz On Strømmen, ...).
-- Every portal user has a `profiles` row that pins them to exactly one client
-- (role 'client') or to none at all (role 'admin', sees everything).
--
-- Isolation is enforced by RLS in the database rather than in route handlers,
-- so a missing check in application code cannot leak one client's data to
-- another. The bot writes with the service-role key, which bypasses RLS.
--
-- Apply via the Supabase SQL editor.

-- ---------------------------------------------------------------- clients --
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  -- Stable machine name the bot sends when logging (e.g. 'handzon-strommen').
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- profiles --
-- One row per portal login. `client_id` is null only for admins.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  client_id   uuid references public.clients on delete cascade,
  role        text not null default 'client' check (role in ('admin', 'client')),
  full_name   text,
  created_at  timestamptz not null default now(),
  -- An admin has no client; a client user must have one.
  constraint profiles_role_client_ck check (
    (role = 'admin'  and client_id is null) or
    (role = 'client' and client_id is not null)
  )
);

-- ---------------------------------------------------------- conversations --
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients on delete cascade,
  started_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  message_count    integer not null default 0,
  -- Set true once the bot successfully books a slot in this conversation.
  booked           boolean not null default false,
  -- Free-form: booking details, user agent, page URL, etc.
  meta             jsonb not null default '{}'::jsonb
);

create index if not exists conversations_client_recent_idx
  on public.conversations (client_id, last_message_at desc);

-- --------------------------------------------------------------- messages --
create table if not exists public.messages (
  id               bigserial primary key,
  conversation_id  uuid not null references public.conversations on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------------- RLS --
alter table public.clients       enable row level security;
alter table public.profiles      enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Helpers. SECURITY DEFINER so they can read `profiles` without recursing
-- through that table's own RLS policies.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- profiles: you can always read your own row; admins read all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- clients: admins see every client; a client user sees only their own.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (public.is_admin() or id = public.my_client_id());

-- conversations / messages: scoped to the caller's client, admins see all.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_admin() or client_id = public.my_client_id());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_admin() or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.client_id = public.my_client_id()
    )
  );

-- No insert/update/delete policies on purpose: the portal is read-only for
-- everyone. Writes happen only through the service-role key, which bypasses RLS.

-- ----------------------------------------------------------------- seed --
insert into public.clients (slug, name)
values ('handzon-strommen', 'Handz On Strømmen Senter')
on conflict (slug) do nothing;
