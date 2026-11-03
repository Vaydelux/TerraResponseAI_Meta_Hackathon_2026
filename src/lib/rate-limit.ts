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
// Upload counters also FAIL CLOSED when the count cannot be trusted.\n// Paid AI inference counters and private evidence mints FAIL CLOSED when
// usage cannot be verified, preventing uncontrolled provider spending
// and unaccounted private-file access.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, serviceRoleKey } from "@/lib/supabase/env";
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


/**
 * AI cost ceilings are server-wide safeguards, not user-visible data.
 * Do NOT use the request's RLS-scoped SSR client: it cannot see other
 * users' event/global telemetry and can undercount paid model calls.
 * Call only after route-level identity and report authorization.
 */
function trustedAiUsageClient() {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function unavailableAiBudget(): RateLimitDecision {
  console.error("[rate-limit] Trusted AI budget accounting is unavailable; blocking inference.");
  return {
    ok: false,
    code: COST_CONTROL_ERRORS.AI_BUDGET_UNAVAILABLE,
    message: "AI analysis is temporarily unavailable because usage limits cannot be verified. Manual review remains available.",
    used: 0,
    limit: 0,
  };
}

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

  if (error || count === null) {
    // A broken count is not zero: fail closed to protect private storage
    // and prevent unbounded spam or rate-limit bypass.
    console.error("[rate-limit] Upload accounting unavailable.", {
      code: error?.code ?? "count_unavailable",
    });
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.USER_UPLOAD_RATE_UNAVAILABLE,
      message: "Photo reporting is temporarily unavailable. No photo was saved. Please retry later.",
      used: 0,
      limit: config.perUserUploadsPerHour,
    };
  }
  const used = count;
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

/** Check the per-user AI call rate, counting trusted usage across all roles. */
export async function checkUserAiCallRate(
  userId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  let used: number;
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await trustedAiUsageClient()
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("occurred_at", since);
    if (error || count == null) return unavailableAiBudget();
    used = count;
  } catch {
    return unavailableAiBudget();
  }
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

/** Check the per-event budget across ALL users, including worker-driven calls. */
export async function checkEventAiBudget(
  eventId: string,
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  let used: number;
  try {
    const { count, error } = await trustedAiUsageClient()
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    if (error || count == null) return unavailableAiBudget();
    used = count;
  } catch {
    return unavailableAiBudget();
  }
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
  let used: number;
  try {
    const supabase = await createSupabaseServerClient();
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("evidence_signed_url_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("occurred_at", since);
    // A missing count is not zero. Do not permit unlimited URL mints
    // when SELECT fails but INSERT or signing still works.
    if (error || count === null) throw new Error("signed URL count unavailable");
    used = count;
  } catch {
    console.error("[rate-limit] Signed evidence rate-limit accounting unavailable.");
    return {
      ok: false,
      code: COST_CONTROL_ERRORS.SIGNED_URL_RATE_UNAVAILABLE,
      message: "Evidence access is temporarily unavailable.",
      used: 0,
      limit: config.perUserSignedUrlsPerMinute,
    };
  }
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

/** Check daily global AI spend across all users/events using trusted SQL access.
 * PostgreSQL numeric amounts may be delivered as decimal strings.
 * Invalid accounting values are blockers, not silently ignored costs.
 */
export async function checkDailySpendCeiling(
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  let usedUsd = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await trustedAiUsageClient()
      .from("ai_usage_log")
      .select("estimated_cost_usd")
      .eq("utc_day", today);
    if (error || !data) return unavailableAiBudget();
    for (const row of data) {
      const raw: unknown = row.estimated_cost_usd;
      if (typeof raw !== "number" && typeof raw !== "string") return unavailableAiBudget();
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || (typeof raw === "string" && raw.trim() === "")) {
        return unavailableAiBudget();
      }
      usedUsd += value;
    }
    if (!Number.isFinite(usedUsd)) return unavailableAiBudget();
  } catch {
    return unavailableAiBudget();
  }
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

/** Check daily global request count, including all event and user activity. */
export async function checkDailyRequestCeiling(
  config: CostControlConfig = readCostControlConfig(),
): Promise<RateLimitDecision> {
  let used: number;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { count, error } = await trustedAiUsageClient()
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("utc_day", today);
    if (error || count == null) return unavailableAiBudget();
    used = count;
  } catch {
    return unavailableAiBudget();
  }
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
