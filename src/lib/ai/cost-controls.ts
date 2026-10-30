// src/lib/ai/cost-controls.ts
//
// Bounded daily API spend + request ceilings. Per the brief:
//   - "Add bounded daily API spend/request ceilings (configurable)"
//   - "Avoid endless retries or repeated cost-incurring requests."
//   - "Log model, prompt version, requests, token/usage counts where
//     the API provides them, latency, estimated cost with clear
//     caveats, and failures without logging secrets or sensitive
//     image content."
//
// This module is the SINGLE SOURCE OF TRUTH for cost-control config.
// It is a pure, side-effect-free module (no DB calls, no network).
// The route handlers + the analyze route call into it to:
//   1. Read the configurable ceilings from env (with safe defaults).
//   2. Check the per-event AI budget (existing) and the global daily
//      spend + daily request count (new).
//   3. Record an AI usage telemetry entry (the new ai_usage_log table
//      in 0004_resilience.sql — model_id, prompt_version, request_id,
//      token counts, latency_ms, estimated_cost_usd, failure_kind).
//
// No secrets are stored. No image bytes are stored. No raw model
// response text is stored (per SECURITY.md §6.4 — only the parsed
// observation is kept on report_analyses; the telemetry row holds
// token counts + latency + estimated cost, never the prompt body
// or the image bytes).
//
// Cost estimation: the model provider's pricing is read from env
// (per-1M-tokens input + output, USD). The estimate is a rough
// upper-bound approximation and is LABELED as such in every consumer
// (the dashboard shows "estimated, ~$" prefix and a caveat). The
// actual provider bill is the source of truth; this is for
// anomaly-detection + budget enforcement only.

export interface CostControlConfig {
  /** Max USD spend per UTC day across all events. 0 = disabled. */
  dailySpendCeilingUsd: number;
  /** Max AI calls per UTC day across all events. 0 = disabled. */
  dailyRequestCeiling: number;
  /** Per-event AI call budget (existing — see docs/BUILD_PLAN.md §6.1). */
  perEventBudget: number;
  /** Per-event AI call budget override floor — admin can raise above
   *  this only with an explicit env unlock. Defensive. */
  perEventBudgetFloor: number;
  /** Per-user AI calls per hour (manual re-analyze cap). 0 = disabled. */
  perUserAiCallsPerHour: number;
  /** Per-user uploads per hour (existing). */
  perUserUploadsPerHour: number;
  /** Per-user signed-URL mints per minute (abuse vector — otherwise
   *  a user could mint thousands of 60s URLs and overload storage). */
  perUserSignedUrlsPerMinute: number;
  /** Model call timeout (ms). 0 = use SDK default. */
  modelCallTimeoutMs: number;
  /** Max retries for transient failures (429/5xx). */
  maxRetries: number;
  /** Estimated input cost per 1M tokens, USD. */
  costPer1mInputTokensUsd: number;
  /** Estimated output cost per 1M tokens, USD. */
  costPer1mOutputTokensUsd: number;
  /** Estimated cost per call (when token counts unavailable), USD. */
  costPerCallFlatUsd: number;
}

/** Read the cost-control config from env, with safe defaults. */
export function readCostControlConfig(): CostControlConfig {
  const num = (key: string, def: number): number => {
    const raw = process.env[key];
    if (raw === undefined || raw === "") return def;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    dailySpendCeilingUsd: num("AI_DAILY_SPEND_CEILING_USD", 50),
    dailyRequestCeiling: num("AI_DAILY_REQUEST_CEILING", 1000),
    perEventBudget: num("AI_PER_EVENT_BUDGET", 500),
    perEventBudgetFloor: num("AI_PER_EVENT_BUDGET_FLOOR", 10),
    perUserAiCallsPerHour: num("AI_PER_USER_CALLS_PER_HOUR", 30),
    perUserUploadsPerHour: num("UPLOAD_RATE_LIMIT_PER_HOUR", 20),
    perUserSignedUrlsPerMinute: num("SIGNED_URL_RATE_LIMIT_PER_MIN", 60),
    modelCallTimeoutMs: num("AI_CALL_TIMEOUT_MS", 30_000),
    maxRetries: num("AI_MAX_RETRIES", 4),
    costPer1mInputTokensUsd: num("AI_COST_PER_1M_INPUT_TOKENS_USD", 0.3),
    costPer1mOutputTokensUsd: num("AI_COST_PER_1M_OUTPUT_TOKENS_USD", 0.6),
    costPerCallFlatUsd: num("AI_COST_PER_CALL_FLAT_USD", 0.001),
  };
}

/** Compute the estimated cost of an AI call from the usage metadata.
 *  Returns a rough USD estimate, labeled as "estimated" in consumers.
 *  When token counts are unavailable, falls back to a per-call flat
 *  rate (clearly caveated — the dashboard shows "~" prefix). */
export function estimateCost(
  usage: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  } | null | undefined,
  config: CostControlConfig = readCostControlConfig(),
): { usd: number; basis: "tokens" | "flat"; caveat: string } {
  if (!usage) {
    return {
      usd: config.costPerCallFlatUsd,
      basis: "flat",
      caveat: "No token counts; flat per-call estimate. Provider bill is the source of truth.",
    };
  }
  const input = usage.promptTokens ?? null;
  const output = usage.completionTokens ?? null;
  if (input !== null && output !== null) {
    const usd =
      (input / 1_000_000) * config.costPer1mInputTokensUsd +
      (output / 1_000_000) * config.costPer1mOutputTokensUsd;
    return {
      usd,
      basis: "tokens",
      caveat: `Estimated from ${input} input + ${output} output tokens at $${config.costPer1mInputTokensUsd}/1M in + $${config.costPer1mOutputTokensUsd}/1M out. Provider bill is the source of truth.`,
    };
  }
  if (usage.totalTokens !== null && usage.totalTokens !== undefined) {
    // Without an input/output split, assume the average of the two
    // rates (clearly caveated).
    const avg = (config.costPer1mInputTokensUsd + config.costPer1mOutputTokensUsd) / 2;
    const usd = (usage.totalTokens / 1_000_000) * avg;
    return {
      usd,
      basis: "tokens",
      caveat: `Estimated from ${usage.totalTokens} total tokens at the average rate (no input/output split). Provider bill is the source of truth.`,
    };
  }
  return {
    usd: config.costPerCallFlatUsd,
    basis: "flat",
    caveat: "Token counts present but unusable; flat per-call estimate. Provider bill is the source of truth.",
  };
}

/** Standardized error codes the route handlers return for ceiling
 *  violations. Each is a 4xx (the client should NOT retry — the
 *  ceiling is exhausted for the period). */
export const COST_CONTROL_ERRORS = {
  DAILY_SPEND_EXCEEDED: "DAILY_SPEND_EXCEEDED",
  DAILY_REQUESTS_EXCEEDED: "DAILY_REQUESTS_EXCEEDED",
  EVENT_BUDGET_EXCEEDED: "EVENT_BUDGET_EXCEEDED",
  USER_AI_RATE_EXCEEDED: "USER_AI_RATE_EXCEEDED",
  USER_UPLOAD_RATE_EXCEEDED: "USER_UPLOAD_RATE_EXCEEDED",
  SIGNED_URL_RATE_EXCEEDED: "SIGNED_URL_RATE_EXCEEDED",
} as const;

/** UTC day stamp YYYY-MM-DD. Used as the partition key for the
 *  daily_spend rollup in ai_usage_log. */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
