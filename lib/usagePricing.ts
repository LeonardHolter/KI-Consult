// Cost estimators for the admin overview. Pure functions, pulled out of the
// component so the arithmetic is testable — the first version lived inline
// and overstated voice cost ~6x for weeks before a human squinted at it.
//
// THE TRAP that caused it: Anthropic and OpenAI report usage differently.
//   Anthropic: input_tokens EXCLUDES cache reads (reported separately).
//   OpenAI:    input_tokens INCLUDES cached tokens (cached_tokens is a
//              subset, broken out in input_token_details).
// The voice formula was written Anthropic-style against OpenAI numbers, so
// every cached token was billed at the full $32 audio rate AND again at a
// (also wrong: $3.20, real: $0.40) cache rate. With ~86% of phone-call
// input being cache reads — the same conversation context re-read every
// turn — that inflated $23 of real usage into $146.

/** Claude Opus 4.8, per 1M tokens. The chat route hardcodes the model;
 *  cache write is the 5-min ephemeral TTL (1.25x), cache read 0.1x. */
export const CHAT_PRICE_PER_MILLION = {
  input: 5.0,
  output: 25.0,
  cacheWrite: 5.0 * 1.25,
  cacheRead: 5.0 * 0.1,
};

/** gpt-realtime, per 1M tokens, per developers.openai.com/api/docs/pricing
 *  (checked 2026-07-26): audio in $32 / cached in $0.40 / audio out $64,
 *  text in $4 / text out $24. */
export const VOICE_PRICE_PER_MILLION = {
  audioInput: 32.0,
  cachedInput: 0.4,
  audioOutput: 64.0,
};

export type ChatUsageTotals = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export type VoiceUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
};

export function estimateChatCostUsd(u: ChatUsageTotals): number {
  return (
    (u.input_tokens * CHAT_PRICE_PER_MILLION.input +
      u.output_tokens * CHAT_PRICE_PER_MILLION.output +
      u.cache_creation_input_tokens * CHAT_PRICE_PER_MILLION.cacheWrite +
      u.cache_read_input_tokens * CHAT_PRICE_PER_MILLION.cacheRead) /
    1_000_000
  );
}

/** Upper-bound estimate, deliberately: voice_usage stores token TOTALS, not
 *  OpenAI's text/audio split, so the un-cached remainder is priced at the
 *  audio rate ($32) even though each call's first-turn prompt is text ($4).
 *  That overshoot is small and safe-side; the errors this replaces were
 *  neither. If exact billing ever matters, store input_token_details at
 *  capture time and price the split. */
export function estimateVoiceCostUsd(v: VoiceUsageTotals): number {
  const cached = Math.min(v.cacheReadInputTokens, v.inputTokens);
  // OpenAI's input_tokens INCLUDES the cached tokens — subtract, never add.
  const uncachedInput = v.inputTokens - cached;
  return (
    (uncachedInput * VOICE_PRICE_PER_MILLION.audioInput +
      cached * VOICE_PRICE_PER_MILLION.cachedInput +
      v.outputTokens * VOICE_PRICE_PER_MILLION.audioOutput) /
    1_000_000
  );
}
