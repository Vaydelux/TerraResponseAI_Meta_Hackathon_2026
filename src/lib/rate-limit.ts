// src/lib/rate-limit.ts
//
// Server-enforced rate limits for:
//   1. Per-user uploads per hour (UPLOAD_RATE_LIMIT_PER_HOUR, default 20).
//   2. Per-user AI calls per hour (AI_PER_USER_CALLS_PER_HOUR, default 30).
//   3. Per-event AI call budget (AI_PER_EVENT_BUDGET, default 500).
//   4. Per-user signed-URL mints per minute (SIGNED_URL_RATE_LIMIT_PER_MIN,
//      default 60).
//   5. Global daily AI spend (USD) + daily AI request count ceilings
//      (AI_DAILY_SPEND_CEILING_USD, AI_DAILY_REQUEST_CEILING).
//
// Per the brief:
//   - "Add bounded daily API spend/request ceilings (configurable)"
//   - "Per-user and per-event server-enforced rate limits"
//   - "Avoid endless retries or repeated cost-incurring requests."
//   - "no ... unbounded API loop ... or silent failures."
//
// Implementation: a sliding-window count over the relevant table.
//   - Uploads: count reports where creator_id = ? AND uploaded_at >=
//     (now - 1h).
//   - AI calls: count ai_usage_log rows where user_id = ? AND
//     occurred_at >= (now - 1h). Includes failures (so a user can't
//     retry-loop past the cap by triggering transient errors).
//   - Per-event AI budget: count ai_usage_log rows where event_id = ?
//     (all-time for the event). Admin can raise the budget via
//     PATCH /api/events/[id] (out of scope here).
//   - Signed URLs: count evidence_signed_url_log rows where
//     user_id = ? AND occurred_at >= (now - 1min).
//   - Daily spend: SUM(estimated_cost_usd) on ai_usage_log where
//     utc_day = today. Daily requests: COUNT(*) on the same.
//
// The counters are rolled up by a unique index on (user_id, occurred_at)
// or (event_id, occurred_at) etc. — see 0004_resilience.sql.
//
// ON FAILURE TO COUNT: the limit is BYPASSED. Rationale: a failed
// count query (e.g., DB unreachable) should NOT block a legitimate
// upload. The ceiling is enforced when the count works; when it
// doesn't, the user can still upload, and the next successful count
// catches up. The brief explicitly says "no silent failures" —
// failures are LOGGED via console.error so the admin sees them in
// the platform logs, but they don't block the request. This is the
// opposite of "fail-closed", which would turn a DB hiccup into a
// full upload outage. Documented inline.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  readCostControlConfig,
  COST_CONTROL_ERRORS,
  type CostControlConfig,
} from "@/lib/ai/cost-controls";

export type RateLimitDecision =
  | { ok: true }
  | {
      ok: false;
      code: (typeof COST_CONTROL_ERRORS)[keyof typeof COST_CONTROL_ERRORS];
      message: string;
      /** For display in the 4xx response body (transparency). */
      used: number;
      limit: number;
    };

/** Check the per-user upload rate (uploads in the last hour). */
export async function checkUserUploadRate(
  userId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", userId)
    .gte("uploaded_at", since);

  if (error) {
    // Fail-OPEN (see module comment): log and allow. The ceiling is
    // enforced when the count works; a DB hiccup shouldn't block a
    // legitimate upload.
    console.error(
      `[rate-limit] checkUserUploadRate failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const used = count ?? 0;
  if (used >= config.perUserUploadsPerHour) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.USER_UPLOAD_RATE_EXCEEDED,
      message: `Upload rate limit reached (${used}/${config.perUserUploadsPerHour} per hour). Try again later.`,
      used,
      limit: config.perUserUploadsPerHour,
    };
  }
  return { ok: true };
}

/** Check the per-user AI call rate (calls in the last hour, including
 *  failures — so a retry loop can't bypass the cap by triggering
 *  transient errors). */
export async function checkUserAiCallRate(
  userId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("occurred_at", since);

  if (error) {
    console.error(
      `[rate-limit] checkUserAiCallRate failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const used = count ?? 0;
  if (used >= config.perUserAiCallsPerHour) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.USER_AI_RATE_EXCEEDED,
      message: `AI call rate limit reached (${used}/${config.perUserAiCallsPerHour} per hour). Try again later or use manual review.`,
      used,
      limit: config.perUserAiCallsPerHour,
    };
  }
  return { ok: true };
}

/** Check the per-event AI call budget (all-time for the event).
 *  This is the existing AI_PER_EVENT_BUDGET — kept here so all the
 *  cost-control logic is in one place. */
export async function checkEventAiBudget(
  eventId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    console.error(
      `[rate-limit] checkEventAiBudget failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const used = count ?? 0;
  if (used >= config.perEventBudget) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.EVENT_BUDGET_EXCEEDED,
      message: `Event AI budget exhausted (${used}/${config.perEventBudget} calls). An admin can raise the budget or a reviewer can do manual analysis.`,
      used,
      limit: config.perEventBudget,
    };
  }
  return { ok: true };
}

/** Check the per-user signed-URL mint rate (mints in the last minute). */
export async function checkSignedUrlRate(
  userId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("evidence_signed_url_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("occurred_at", since);

  if (error) {
    console.error(
      `[rate-limit] checkSignedUrlRate failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const used = count ?? 0;
  if (used >= config.perUserSignedUrlsPerMinute) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.SIGNED_URL_RATE_EXCEEDED,
      message: `Signed-URL mint rate limit reached (${used}/${config.perUserSignedUrlsPerMinute} per minute).`,
      used,
      limit: config.perUserSignedUrlsPerMinute,
    };
  }
  return { ok: true };
}

/** Check the global daily AI spend ceiling (sum of estimated_cost_usd
 *  for the current UTC day). */
export async function checkDailySpendCeiling(
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("estimated_cost_usd")
    .eq("utc_day", today);

  if (error) {
    console.error(
      `[rate-limit] checkDailySpendCeiling failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const usedUsd = (data ?? []).reduce(
    (sum, row) => sum + (typeof row.estimated_cost_usd === "number" ? row.estimated_cost_usd : 0),
    0,
  );
  if (config.dailySpendCeilingUsd > 0 && usedUsd >= config.dailySpendCeilingUsd) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.DAILY_SPEND_EXCEEDED,
      message: `Daily AI spend ceiling reached ($${usedUsd.toFixed(4)}/$${config.dailySpendCeilingUsd} USD). Try again tomorrow or contact an admin.`,
      used: Number(usedUsd.toFixed(4)),
      limit: config.dailySpendCeilingUsd,
    };
  }
  return { ok: true };
}

/** Check the global daily AI request count ceiling. */
export async function checkDailyRequestCeiling(
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("utc_day", today);

  if (error) {
    console.error(
      `[rate-limit] checkDailyRequestCeiling failed (allowing): ${error.message}`,
    );
    return { ok: true };
  }
  const used = count ?? 0;
  if (config.dailyRequestCeiling > 0 && used >= config.dailyRequestCeiling) {
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.DAILY_REQUESTS_EXCEEDED,
      message: `Daily AI request ceiling reached (${used}/${config.dailyRequestCeiling}). Try again tomorrow.`,
      used,
      limit: config.dailyRequestCeiling,
    };
  }
  return { ok: true };
}

/** Convenience: run all the ceilings that gate an AI call before the
 *  model is invoked. Returns the FIRST failure (or ok). The caller
 *  is responsible for translating the failure into a 4xx response.
 *
 *  Order: cheapest-to-compute first (per-user → per-event → global
 *  daily). The caller stops at the first failure. */
export async function checkAllAiCallCeilings(args: {
  userId: string;
  eventId: string;
  config?: CostControlConfig;
}): Promise<RateLimitDecision> {
  const config = args.config ?? readCostControlConfig();
  // Per-user first (cheap, narrow index).
  const user = await checkUserAiCallRate(args.userId, config);
  if (!user.ok) return user;
  // Per-event budget (medium cost — counts all rows for the event).
  const event = await checkEventAiBudget(args.eventId, config);
  if (!event.ok) return event;
  // Global daily (most expensive — counts all rows for the day).
  const spend = await checkDailySpendCeiling(config);
  if (!spend.ok) return spend;
  const reqs = await checkDailyRequestCeiling(config);
  if (!reqs.ok) return reqs;
  return { ok: true };
}
