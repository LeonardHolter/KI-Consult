-- Makes (client_id, started_at) the identity of a voice call, so the same
-- call can never be counted twice.
--
-- Why: clients on ElevenLabs never touch our servers during a call, so
-- lib/voiceDemo/elevenlabsUsage.ts reconciles their calls from ElevenLabs'
-- conversation list on every KPI read. That is a check-then-insert, and two
-- dashboards loading at the same moment (a client tab and an admin tab, or a
-- double navigation) would both find the row missing and both write it. The
-- call count, the minutes and the ROI figure shown to a paying client would
-- inflate permanently, with nothing to point at afterwards.
--
-- The pair is a safe identity: a call's start time is second-exact and
-- immutable, and one client cannot begin two calls in the same second on the
-- same line. The OpenAI write paths (browser hangup, phone bridge) insert
-- the same shape and are equally protected by this.
--
-- Apply via the Supabase SQL editor, after 001-008.
--
-- If duplicates already exist, this index cannot be created until they are
-- removed — the DELETE below keeps the lowest id per (client_id, started_at)
-- and is a no-op on a clean table.

delete from public.voice_usage a
  using public.voice_usage b
 where a.client_id = b.client_id
   and a.started_at = b.started_at
   and a.id > b.id;

create unique index if not exists voice_usage_client_started_key
  on public.voice_usage (client_id, started_at);
