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
