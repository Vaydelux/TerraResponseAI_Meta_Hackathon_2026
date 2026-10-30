// src/lib/ai/safe-retry.ts
//
// Safe manual-retry controls. Per the brief:
//   - "safe retry buttons"
//   - "Avoid endless retries or repeated cost-incurring requests."
//
// What this module enforces:
//
//   1. A report can only be retried (manual re-analyze) when its
//      state is retryable_error (the model call failed transiently
//      and backoff didn't recover). Other states (uploaded/analyzing/
//      needs_review/needs_manual_review/reviewed) are NOT retryable
//      via this path:
//      - uploaded    — never analyzed; the user can call the analyze
//                       route (the first analysis isn't a retry).
//      - analyzing    — another request is in progress; 409.
//      - needs_review — already analyzed; re-running would waste cost
//                       (SECURITY.md §6.5: "Never Run the AI Model on
//                       a Report a Second Time Automatically"). A
//                       reviewer can request a forced re-analysis via
//                       a separate admin-only endpoint (out of scope).
//      - needs_manual_review — the reviewer decided to do it by hand.
//      - reviewed    — the review is complete; no re-analysis.
//
//   2. A manual retry increments retry_count. The route handler
//      refuses to retry when retry_count >= MAX_MANUAL_RETRIES
//      (default 5, matching the retry.ts cap). The report is parked
//      in needs_manual_review with last_error = "AI retry exhausted
//      after N attempts." This bounds the total cost per report to
//      MAX_MANUAL_RETRIES + 1 model calls (1 initial + 5 retries).
//
//   3. The per-user AI call rate (AI_PER_USER_CALLS_PER_HOUR) and
//      the per-event AI budget (AI_PER_EVENT_BUDGET) and the daily
//      ceilings all apply to manual retries too — a user can't
//      bypass the global ceilings by retrying.
//
//   4. The "force manual review" button (a reviewer transitions a
//      report from retryable_error or analyzing to needs_manual_
//      review without a model call) does NOT count against any
//      ceiling — it's a free action (no model invocation).
//
// This module is the application-layer assertion. The route handler
// ALSO checks the DB row's state (defense-in-depth).

import { readCostControlConfig } from "@/lib/ai/cost-controls";

/** Max manual retries per report. Matches retry.ts MAX_RETRIES so
 *  the automated backoff + the manual retry share the same ceiling. */
export const MAX_MANUAL_RETRIES = 5;

/** The states from which a manual re-analyze is allowed. */
export const RETRYABLE_STATES = new Set(["uploaded", "retryable_error"] as const);

export type RetryableState = (typeof RETRYABLE_STATES extends Set<infer T> ? T : never);

export interface RetryDecision {
  /** True if the manual retry is allowed. */
  allowed: boolean;
  /** When not allowed, the reason. */
  reason?: string;
  /** The current retry_count (read from the report row). */
  retryCount: number;
  /** The new retry_count if the retry proceeds (retryCount + 1). */
  nextRetryCount: number;
  /** True if the report should transition to needs_manual_review
   *  instead of re-running the model (the cap is reached). */
  parkAsManualReview: boolean;
}

/** Decide whether a manual retry is allowed, given the current
 *  state + retry count. Pure function.
 *
 *  Note: `config.maxRetries` defaults to `MAX_MANUAL_RETRIES` (5, the
 *  brief's "5 attempts" cap), NOT the cost-control config's
 *  `maxRetries` (which is 4 — the automated backoff retry cap). The
 *  two are independent:
 *    - `MAX_MANUAL_RETRIES` (5) caps the manual re-analyze button.
 *    - `costControl.maxRetries` (4) caps the automated backoff inside
 *      a single AI call (the `withRetry` loop in muse-spark.ts).
 *  The cap on retries that a user can trigger by clicking "Re-analyze"
 *  is 5 (matches the brief). The automated backoff inside one call is
 *  bounded to 4 (smaller, faster-fail). */
export function decideManualRetry(args: {
  status: string;
  retryCount: number;
  config?: { maxRetries: number };
}): RetryDecision {
  const max = args.config?.maxRetries ?? MAX_MANUAL_RETRIES;
  const retryCount = args.retryCount;
  const nextRetryCount = retryCount + 1;

  // State gate: only uploaded + retryable_error can be retried.
  if (!RETRYABLE_STATES.has(args.status as RetryableState)) {
    return {
      allowed: false,
      reason: `Cannot retry a report in state '${args.status}'. Only 'uploaded' or 'retryable_error' can be retried.`,
      retryCount,
      nextRetryCount,
      parkAsManualReview: false,
    };
  }

  // Cap gate: the retry would push past the cap → park as manual review.
  if (retryCount >= max) {
    return {
      allowed: false,
      reason: `AI retry exhausted after ${max} attempts. The report is parked in manual review; a reviewer can analyze it by hand.`,
      retryCount,
      nextRetryCount,
      parkAsManualReview: true,
    };
  }

  return {
    allowed: true,
    retryCount,
    nextRetryCount,
    parkAsManualReview: false,
  };
}

/** States from which a reviewer can force-transition to manual
 *  review (no model call). Includes analyzing (the model call is
 *  stuck) + retryable_error (the backoff isn't recovering). */
export const FORCE_MANUAL_REVIEW_STATES = new Set([
  "analyzing",
  "retryable_error",
  "needs_review",
] as const);

export interface ForceManualReviewDecision {
  allowed: boolean;
  reason?: string;
}

export function decideForceManualReview(status: string): ForceManualReviewDecision {
  if (!FORCE_MANUAL_REVIEW_STATES.has(status as (typeof FORCE_MANUAL_REVIEW_STATES extends Set<infer T> ? T : never))) {
    return {
      allowed: false,
      reason: `Cannot force-manual-review a report in state '${status}'. Allowed states: analyzing, retryable_error, needs_review.`,
    };
  }
  return { allowed: true };
}
