import { describe, expect, it } from "vitest";
import {
  CHAT_PRICE_PER_MILLION,
  VOICE_PRICE_PER_MILLION,
  estimateChatCostUsd,
  estimateVoiceCostUsd,
} from "@/lib/usagePricing";

// Pins the arithmetic AND the provider semantics. The bug these tests bury:
// OpenAI's input_tokens INCLUDES cached tokens (Anthropic's excludes them),
// and the first formula treated OpenAI like Anthropic — billing every cache
// read at the full audio rate plus a wrong cache rate on top. 49 minutes of
// phone calls showed as $146; the true upper bound was ~$23.

describe("voice cost (gpt-realtime)", () => {
  it("subtracts cached tokens from input instead of double-billing them", () => {
    // 1M input of which 0.9M cached: 0.1M @ $32 + 0.9M @ $0.40 = $3.56.
    const usd = estimateVoiceCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 900_000,
    });
    expect(usd).toBeCloseTo(3.56, 5);
  });

  it("regression: the exact production totals that displayed as ~$143 voice", () => {
    // Real sums from client_voice_usage_stats, 2026-07-26: 46 calls, 49 min.
    const usd = estimateVoiceCostUsd({
      inputTokens: 4_023_105,
      outputTokens: 48_837,
      cacheReadInputTokens: 3_446_336,
    });
    expect(usd).toBeGreaterThan(15);
    expect(usd).toBeLessThan(25); // was 142.9 with the old formula
  });

  it("a fully-uncached call is priced at the plain audio rates", () => {
    const usd = estimateVoiceCostUsd({
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadInputTokens: 0,
    });
    expect(usd).toBeCloseTo((0.1 * 32 + 0.05 * 64), 5);
  });

  it("never goes negative if cache reads exceed reported input (defensive)", () => {
    const usd = estimateVoiceCostUsd({
      inputTokens: 10,
      outputTokens: 0,
      cacheReadInputTokens: 999,
    });
    expect(usd).toBeGreaterThanOrEqual(0);
  });

  it("cached rate matches OpenAI's published $0.40, not a guessed 10%", () => {
    expect(VOICE_PRICE_PER_MILLION.cachedInput).toBe(0.4);
  });
});

describe("chat cost (Claude Opus 4.8)", () => {
  it("prices each bucket at its own rate — Anthropic reports them disjoint", () => {
    const usd = estimateChatCostUsd({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(
      CHAT_PRICE_PER_MILLION.input +
        CHAT_PRICE_PER_MILLION.output +
        CHAT_PRICE_PER_MILLION.cacheWrite +
        CHAT_PRICE_PER_MILLION.cacheRead,
      5,
    );
  });
});

// Migration 008: rows recorded since store OpenAI's text/audio split, and the
// estimator prices them exactly. The bug this buries: the upper bound charged
// the ~13k-token TEXT system prompt at the $32 AUDIO rate on every call —
// with 1–2 minute calls that tripled the shown cost (4.59 kr/min shown,
// ~1.5 real, verified against 65 production calls 2026-08-16).
describe("voice cost with the token split (post-008 rows)", () => {
  it("prices text input at $4, not $32", () => {
    // One short call: 13k text prompt + 1k audio in, nothing cached,
    // 1k audio out. Exact: .013*4 + .001*32 + .001*64 = $0.148.
    const usd = estimateVoiceCostUsd({
      inputTokens: 14_000,
      outputTokens: 1_000,
      cacheReadInputTokens: 0,
      textInputTokens: 13_000,
      audioInputTokens: 1_000,
      audioOutputTokens: 1_000,
    });
    expect(usd).toBeCloseTo(0.148, 4);
    // The old upper bound would have said .014*32 + .001*64 = $0.512 — 3.5x.
    expect(usd).toBeLessThan(0.2);
  });

  it("cache reads are subtracted before the split is priced", () => {
    // 90k cached of 100k input (60k text / 40k audio). Uncached 10k, of
    // which audio-first attribution: 10k audio @ $32. Cached 90k @ $0.40.
    const usd = estimateVoiceCostUsd({
      inputTokens: 100_000,
      outputTokens: 0,
      cacheReadInputTokens: 90_000,
      textInputTokens: 60_000,
      audioInputTokens: 40_000,
      audioOutputTokens: 0,
    });
    expect(usd).toBeCloseTo((10_000 * 32 + 90_000 * 0.4) / 1e6, 6);
  });

  it("text output is priced at $24, audio output at $64", () => {
    const usd = estimateVoiceCostUsd({
      inputTokens: 0,
      outputTokens: 10_000,
      cacheReadInputTokens: 0,
      textInputTokens: 1, // marks the row set as split-bearing
      audioInputTokens: 0,
      audioOutputTokens: 4_000,
    });
    expect(usd).toBeCloseTo((1 * 4 + 4_000 * 64 + 6_000 * 24) / 1e6, 6);
  });

  it("a mixed aggregate prices split rows exactly and legacy rows at the bound", () => {
    // Legacy half: 100k input, 0 cached, 0 out -> 100k @ $32 = $3.20.
    // Split half: 13k text uncached -> $0.052.
    const usd = estimateVoiceCostUsd({
      inputTokens: 113_000,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      textInputTokens: 13_000,
      audioInputTokens: 0,
      audioOutputTokens: 0,
      splitOutputTokens: 0,
      splitCacheReadInputTokens: 0,
      legacyInputTokens: 100_000,
      legacyOutputTokens: 0,
      legacyCacheReadInputTokens: 0,
    });
    expect(usd).toBeCloseTo(3.2 + 0.052, 6);
  });

  it("rows without any split keep the exact old upper-bound number", () => {
    const legacyShape = { inputTokens: 1_000_000, outputTokens: 0, cacheReadInputTokens: 900_000 };
    expect(estimateVoiceCostUsd(legacyShape)).toBeCloseTo(3.56, 5);
  });
});
