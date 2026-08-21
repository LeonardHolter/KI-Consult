-- Lets bot_events record the outcome of every shop notification.
--
-- Why: a booking e-mail that never arrives is invisible today. notifyShop
-- returns {sent:false, reason} and the booking path throws that away — the
-- booking succeeds, the customer hears a confirmation, and the shop simply
-- never learns a customer is coming. Resend's free tier caps at 100 mails a
-- DAY across the whole account, so the most likely cause of that silence is
-- also the one that arrives without warning.
--
-- Two new types rather than one: the count of successes answers "how close
-- am I to the cap?", and the failures answer "did anyone stop hearing from
-- us?". Only the second is an alert, but you cannot see the second coming
-- without the first.
--
-- Apply via the Supabase SQL editor, after 001-009.

alter table public.bot_events drop constraint if exists bot_events_type_check;

alter table public.bot_events add constraint bot_events_type_check
  check (type in (
    'deflection',
    'error',
    'rate_limited',
    'cors_rejected',
    'tool_error',
    'notify_sent',
    'notify_failed'
  ));
