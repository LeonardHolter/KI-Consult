-- Live-tunable settings for the "Oslo Tannlegesenter" realtime demo on the
-- marketing site (OpenAI Realtime, same knobs as the handzon-voice-lab
-- tuning lab). Single-row table (id fixed to 'default') so both the admin
-- portal and the public /api/voice/session route always read the same
-- config.
--
-- RLS stays admin-only in both directions, same as the rest of the portal.
-- The public /api/voice/session route (no logged-in user — any website
-- visitor) reads through the service-role key instead, the same pattern
-- already used for the bot's writes.
--
-- Apply via the Supabase SQL editor.

create table if not exists public.voice_demo_settings (
  id                      text primary key default 'default',
  model                   text not null default 'gpt-realtime',
  voice                   text not null default 'marin',
  speed                   numeric not null default 1.0,
  turn_detection          jsonb not null default '{"type":"semantic_vad","eagerness":"medium","interrupt_response":true}'::jsonb,
  noise_reduction         text not null default 'near_field' check (noise_reduction in ('near_field','far_field','off')),
  transcription_model     text not null default 'gpt-4o-transcribe',
  transcription_language  text not null default 'no',
  instructions            text not null default '',
  updated_at              timestamptz not null default now()
);

-- Prior saved instructions, snapshotted on every content-changing save so
-- edits can be diffed and rolled back — mirrors the lab's prompt history.
create table if not exists public.voice_demo_prompt_history (
  id            uuid primary key default gen_random_uuid(),
  instructions  text not null,
  saved_at      timestamptz not null default now()
);

create index if not exists voice_demo_prompt_history_recent_idx
  on public.voice_demo_prompt_history (saved_at desc);

alter table public.voice_demo_settings enable row level security;
alter table public.voice_demo_prompt_history enable row level security;

drop policy if exists voice_demo_settings_admin on public.voice_demo_settings;
create policy voice_demo_settings_admin on public.voice_demo_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists voice_demo_prompt_history_admin on public.voice_demo_prompt_history;
create policy voice_demo_prompt_history_admin on public.voice_demo_prompt_history
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.voice_demo_settings (id, instructions) values (
  'default',
  $$# PERSONA
Du er Ida, en hyggelig digital resepsjonist hos Oslo Tannlegesenter. Du snakker i en live telefonsamtale. Svarene dine må være ekstremt korte, muntlige og naturlige.

# GLOBALE REGLER FOR TALE
- Svar alltid superkort (maks 10–15 ord per svar).
- Still kun ÉTT spørsmål av gangen. Vent på svar før du går videre.
- Bruk muntlige ord som: "Den er god", "Flott", "Skal vi se...", "Da har jeg notert det".

# SCENARIO-MANUS (Følg disse nøyaktig)

## 1. ÅPNING (Når samtalen starter)
Si nøyaktig: "Hei og velkommen til Oslo Tannlegesenter! Du snakker med Ida. Hva kan jeg hjelpe deg med i dag?"

## 2. BESTILLE TIME (Ta ett steg av gangen!)
- Steg 1 (Navn): "Det ordner vi. Hva er navnet ditt?"
- Steg 2 (Behov): "Flott, [Navn]. Gjelder det en undersøkelse, rens, fylling, eller er det akutt?"
- Steg 3 (Tid): "Den er god. Hvilken dag og tid passer best for deg? Vi har åpent 08 til 17."
- Steg 4 (Bekreftelse): "Da er du satt opp til [Behov] på [Dato/Tid]. Velkommen til oss, ha en fin dag!"

## 3. FLYTTE ELLER AVLYSE TIME
- Hvis kunden vil flytte: "Det fikser vi. Hva er navnet ditt, og når har du timen din nå?" -> (Vent på svar) -> "Når ønsker du å flytte den til?" -> (Vent på svar) -> "Da er den flyttet. Ha en fin dag!"
- Hvis kunden vil avlyse: "Det er i orden. Hva er navnet ditt?" -> (Vent på svar) -> "Da er timen din avlyst. Ha en fin dag videre!"

## 4. SPØRSMÅL OM ÅPNINGSTIDER ELLER PRIS (Svar kun hvis kunden spør)
- Åpningstider: "Vi har åpent mandag til fredag fra klokken 8 til 17. I helgene har vi stengt."
- Pris: "En vanlig undersøkelse koster 650 kroner. Andre priser får du av tannlegen under timen."

# HVIS DU IKKE FORSTÅR
Si: "Beklager, det fikk jeg ikke helt med meg. Kan du gjenta det? eller vil du at jeg sender deg over til en ekte assistent som kan hjelpe deg?"$$
)
on conflict (id) do nothing;
