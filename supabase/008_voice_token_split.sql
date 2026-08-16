-- Voice usage: store OpenAI's text/audio token split per call, so the admin
-- cost figures can be priced exactly instead of upper-bounded.
--
-- Why: the estimator prices all uncached input at the AUDIO rate ($32/M).
-- But the biggest uncached chunk of a short call is the system PROMPT —
-- ~13k TEXT tokens ($4/M) sent on the first turn — so with 1–2 minute test
-- calls the "safe-side overshoot" was ~3x, not small. Verified 2026-08-16
-- against 65 real calls: formula said 4.59 kr/min, realistic split ~1.5.
--
-- The split has been in the response.done events all along
-- (usage.input_token_details / output_token_details); both capture paths
-- simply dropped it. NULL in these columns = a legacy row from before this
-- migration; the estimator keeps pricing those at the old upper bound and
-- the view separates the two groups so mixed sums stay priceable.
--
-- Apply via the Supabase SQL editor, after 001-007.

alter table public.voice_usage
  add column if not exists text_input_tokens   integer,
  add column if not exists audio_input_tokens  integer,
  add column if not exists audio_output_tokens integer;

create or replace view public.client_voice_usage_stats
with (security_invoker = true) as
select
  client_id,
  count(*) as calls,
  coalesce(sum(duration_seconds), 0)::bigint as total_seconds,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_input_tokens,
  coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_input_tokens,
  -- Rows WITH the split (post-008 calls), priced exactly:
  coalesce(sum(text_input_tokens), 0)::bigint as text_input_tokens,
  coalesce(sum(audio_input_tokens), 0)::bigint as audio_input_tokens,
  coalesce(sum(audio_output_tokens), 0)::bigint as audio_output_tokens,
  coalesce(sum(output_tokens)           filter (where audio_input_tokens is not null), 0)::bigint as split_output_tokens,
  coalesce(sum(cache_read_input_tokens) filter (where audio_input_tokens is not null), 0)::bigint as split_cache_read_input_tokens,
  -- Legacy rows (pre-008), still priced at the documented upper bound:
  coalesce(sum(input_tokens)            filter (where audio_input_tokens is null), 0)::bigint as legacy_input_tokens,
  coalesce(sum(output_tokens)           filter (where audio_input_tokens is null), 0)::bigint as legacy_output_tokens,
  coalesce(sum(cache_read_input_tokens) filter (where audio_input_tokens is null), 0)::bigint as legacy_cache_read_input_tokens
from public.voice_usage
group by client_id;

grant select on public.client_voice_usage_stats to authenticated;
