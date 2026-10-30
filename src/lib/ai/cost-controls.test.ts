// src/lib/ai/cost-controls.test.ts
//
// Pure-function tests for the cost-control config + the cost estimator.
// No DB, no network.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readCostControlConfig,
  estimateCost,
  COST_CONTROL_ERRORS,
  utcDay,
} from "@/lib/ai/cost-controls";

describe("cost-controls: readCostControlConfig", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    // Wipe the cost-control env vars so each test starts from defaults.
    delete process.env.AI_DAILY_SPEND_CEILING_USD;
    delete process.env.AI_DAILY_REQUEST_CEILING;
    delete process.env.AI_PER_EVENT_BUDGET;
    delete process.env.AI_PER_USER_CALLS_PER_HOUR;
    delete process.env.UPLOAD_RATE_LIMIT_PER_HOUR;
    delete process.env.SIGNED_URL_RATE_LIMIT_PER_MIN;
    delete process.env.AI_CALL_TIMEOUT_MS;
    delete process.env.AI_MAX_RETRIES;
    delete process.env.AI_COST_PER_1M_INPUT_TOKENS_USD;
    delete process.env.AI_COST_PER_1M_OUTPUT_TOKENS_USD;
    delete process.env.AI_COST_PER_CALL_FLAT_USD;
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("returns the safe defaults when no env vars are set", () => {
    const c = readCostControlConfig();
    expect(c.dailySpendCeilingUsd).toBe(50);
    expect(c.dailyRequestCeiling).toBe(1000);
    expect(c.perEventBudget).toBe(500);
    expect(c.perUserAiCallsPerHour).toBe(30);
    expect(c.perUserUploadsPerHour).toBe(20);
    expect(c.perUserSignedUrlsPerMinute).toBe(60);
    expect(c.modelCallTimeoutMs).toBe(30_000);
    expect(c.maxRetries).toBe(4);
    expect(c.costPer1mInputTokensUsd).toBe(0.3);
    expect(c.costPer1mOutputTokensUsd).toBe(0.6);
    expect(c.costPerCallFlatUsd).toBe(0.001);
  });

  it("reads overrides from env", () => {
    process.env.AI_DAILY_SPEND_CEILING_USD = "10";
    process.env.AI_PER_EVENT_BUDGET = "100";
    process.env.AI_MAX_RETRIES = "2";
    const c = readCostControlConfig();
    expect(c.dailySpendCeilingUsd).toBe(10);
    expect(c.perEventBudget).toBe(100);
    expect(c.maxRetries).toBe(2);
  });

  it("falls back to defaults on invalid env (NaN, negative)", () => {
    process.env.AI_DAILY_SPEND_CEILING_USD = "not-a-number";
    process.env.AI_PER_EVENT_BUDGET = "-5";
    const c = readCostControlConfig();
    expect(c.dailySpendCeilingUsd).toBe(50);
    expect(c.perEventBudget).toBe(500);
  });

  it("treats empty string as 'use the default'", () => {
    process.env.AI_DAILY_SPEND_CEILING_USD = "";
    const c = readCostControlConfig();
    expect(c.dailySpendCeilingUsd).toBe(50);
  });
});

describe("cost-controls: estimateCost", () => {
  it("uses token-based estimate when input + output tokens are present", () => {
    const usd = estimateCost(
      { promptTokens: 1_000_000, completionTokens: 500_000 },
      {
        costPer1mInputTokensUsd: 0.3,
        costPer1mOutputTokensUsd: 0.6,
        costPerCallFlatUsd: 0.001,
      } as any,
    );
    expect(usd.basis).toBe("tokens");
    expect(usd.usd).toBeCloseTo(0.6, 5); // 0.3 input + 0.3 output
    expect(usd.caveat).toContain("1000000 input");
    expect(usd.caveat).toContain("500000 output");
  });

  it("uses total tokens with average rate when no input/output split", () => {
    const usd = estimateCost(
      { totalTokens: 1_000_000 },
      {
        costPer1mInputTokensUsd: 0.2,
        costPer1mOutputTokensUsd: 0.6,
        costPerCallFlatUsd: 0.001,
      } as any,
    );
    expect(usd.basis).toBe("tokens");
    // Average = 0.4 per 1M tokens → 1M tokens = $0.4
    expect(usd.usd).toBeCloseTo(0.4, 5);
    expect(usd.caveat).toContain("no input/output split");
  });

  it("falls back to flat per-call when no token counts", () => {
    const usd = estimateCost(null, {
      costPer1mInputTokensUsd: 0.3,
      costPer1mOutputTokensUsd: 0.6,
      costPerCallFlatUsd: 0.001,
    } as any);
    expect(usd.basis).toBe("flat");
    expect(usd.usd).toBe(0.001);
    expect(usd.caveat).toContain("flat per-call estimate");
  });

  it("falls back to flat when usage is null in the call (null usage arg)", () => {
    const usd = estimateCost(undefined, {
      costPerCallFlatUsd: 0.002,
    } as any);
    expect(usd.basis).toBe("flat");
    expect(usd.usd).toBe(0.002);
  });

  it("always labels estimate as 'estimated' in the caveat", () => {
    const usd = estimateCost({ promptTokens: 100, completionTokens: 50 });
    expect(usd.caveat).toContain("Estimated");
    expect(usd.caveat).toContain("Provider bill is the source of truth");
  });
});

describe("cost-controls: COST_CONTROL_ERRORS", () => {
  it("exposes the canonical error codes", () => {
    expect(COST_CONTROL_ERRORS.DAILY_SPEND_EXCEEDED).toBe("DAILY_SPEND_EXCEEDED");
    expect(COST_CONTROL_ERRORS.DAILY_REQUESTS_EXCEEDED).toBe("DAILY_REQUESTS_EXCEEDED");
    expect(COST_CONTROL_ERRORS.EVENT_BUDGET_EXCEEDED).toBe("EVENT_BUDGET_EXCEEDED");
    expect(COST_CONTROL_ERRORS.USER_AI_RATE_EXCEEDED).toBe("USER_AI_RATE_EXCEEDED");
    expect(COST_CONTROL_ERRORS.USER_UPLOAD_RATE_EXCEEDED).toBe("USER_UPLOAD_RATE_EXCEEDED");
    expect(COST_CONTROL_ERRORS.SIGNED_URL_RATE_EXCEEDED).toBe("SIGNED_URL_RATE_EXCEEDED");
  });
});

describe("cost-controls: utcDay", () => {
  it("formats a Date as YYYY-MM-DD in UTC", () => {
    const d = new Date("2024-01-15T12:34:56Z");
    expect(utcDay(d)).toBe("2024-01-15");
  });

  it("returns the current UTC day when no argument", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(utcDay()).toBe(today);
  });
});
