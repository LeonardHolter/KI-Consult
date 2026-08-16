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
  textInput: 4.0,
  cachedInput: 0.4,
  audioOutput: 64.0,
  textOutput: 24.0,
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
  /** Text/audio split from OpenAI's input_token_details / output_token_details,
   *  recorded per call since migration 008. Absent or zero-with-legacy = the
   *  split is unknown and the row set is priced at the old upper bound. */
  textInputTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  /** Output/cache sums for ONLY the rows that carry a split — needed when an
   *  aggregate mixes legacy and split rows (client_voice_usage_stats). */
  splitOutputTokens?: number;
  splitCacheReadInputTokens?: number;
  /** Sums for ONLY the legacy rows (no split recorded). */
  legacyInputTokens?: number;
  legacyOutputTokens?: number;
  legacyCacheReadInputTokens?: number;
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
function upperBoundUsd(inputTokens: number, outputTokens: number, cacheRead: number): number {
  const cached = Math.min(cacheRead, inputTokens);
  // OpenAI's input_tokens INCLUDES the cached tokens — subtract, never add.
  const uncachedInput = inputTokens - cached;
  return (
    (uncachedInput * VOICE_PRICE_PER_MILLION.audioInput +
      cached * VOICE_PRICE_PER_MILLION.cachedInput +
      outputTokens * VOICE_PRICE_PER_MILLION.audioOutput) /
    1_000_000
  );
}

/** Exact-split pricing for rows that recorded input_token_details. The one
 *  remaining approximation: cache reads aren't split by type, so the audio
 *  share of the UNCACHED input is taken as min(audioInput, uncached) —
 *  safe-side, and tiny next to the 8x text-as-audio error this replaces. */
function splitUsd(v: {
  textInputTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}): number {
  const input = v.textInputTokens + v.audioInputTokens;
  const cached = Math.min(v.cacheReadInputTokens, input);
  const uncached = input - cached;
  const uncachedAudio = Math.min(v.audioInputTokens, uncached);
  const uncachedText = uncached - uncachedAudio;
  const audioOut = Math.min(v.audioOutputTokens, v.outputTokens);
  const textOut = v.outputTokens - audioOut;
  return (
    (uncachedText * VOICE_PRICE_PER_MILLION.textInput +
      uncachedAudio * VOICE_PRICE_PER_MILLION.audioInput +
      cached * VOICE_PRICE_PER_MILLION.cachedInput +
      audioOut * VOICE_PRICE_PER_MILLION.audioOutput +
      textOut * VOICE_PRICE_PER_MILLION.textOutput) /
    1_000_000
  );
}

export function estimateVoiceCostUsd(v: VoiceUsageTotals): number {
  const hasSplit = (v.textInputTokens ?? 0) + (v.audioInputTokens ?? 0) > 0;
  if (!hasSplit) {
    // Pre-008 data only: the documented upper bound.
    return upperBoundUsd(v.inputTokens, v.outputTokens, v.cacheReadInputTokens);
  }
  // Mixed aggregate: exact for the rows that carry a split, upper bound for
  // the legacy remainder. When the caller provides no legacy sums, every
  // row has a split and the legacy term is zero.
  const exact = splitUsd({
    textInputTokens: v.textInputTokens ?? 0,
    audioInputTokens: v.audioInputTokens ?? 0,
    audioOutputTokens: v.audioOutputTokens ?? 0,
    outputTokens: v.splitOutputTokens ?? v.outputTokens,
    cacheReadInputTokens: v.splitCacheReadInputTokens ?? v.cacheReadInputTokens,
  });
  const legacy = upperBoundUsd(
    v.legacyInputTokens ?? 0,
    v.legacyOutputTokens ?? 0,
    v.legacyCacheReadInputTokens ?? 0,
  );
  return exact + legacy;
}
