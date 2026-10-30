// src/lib/ai/dedup-cache.ts
//
// Duplicate-hash cache: skip re-analysis of identical images within
// the same event. Per the brief:
//   - "duplicate-hash cache"
//   - "Avoid endless retries or repeated cost-incurring requests."
//
// When a report transitions to needs_review (a successful AI call),
// the cache stores {event_id, sha256 → report_analyses row}. A
// subsequent upload of the SAME image (same sha256) within the SAME
// event:
//   1. Is detected by the existing upload-time dedup (src/lib/storage/
//      dedup.ts) — returns 409 DUPLICATE with the existing report id.
//      The client can confirm a "link to existing" via linkToReportId
//      (see reports/route.ts POST step 8).
//   2. If the duplicate slips past the upload-time check (e.g., the
//      first upload was deleted and re-uploaded, or the SHA-256
//      matches across events — but RLS prevents cross-event leak),
//      the analyze route checks this cache BEFORE calling the model.
//      A cache hit reuses the existing analysis (no model call, no
//      cost). This is the "Optional O11 — AI response caching" from
//      BUILD_PLAN.md §6.5, now implemented because the brief
//      explicitly requires it.
//
// Privacy / RLS:
//   - The cache query is filtered by event_id AND sha256. RLS further
//     restricts to reports the user can see (creator OR event
//     reviewer+). The cache query NEVER returns rows from another
//     event (the existing reports_select_creator_or_event_reviewer_
//     or_admin policy).
//   - The cached structured_observation is reused as-is (it's the
//     parsed observation, not the raw model output). Reviewer
//     corrections are preserved (the cache reads the CURRENT
//     structured_observation, which a reviewer may have corrected
//     via POST /api/reports/[id]/review).
//
// What this is NOT:
//   - It's not a perceptual-hash near-duplicate cache. Identical
//     bytes only. Perceptual hashing is out of scope for the MVP.
//   - It's not a cross-event cache. A re-upload of the same image
//     in a different event still triggers a model call (the cache
//     is keyed by event_id + sha256). This is intentional: the AI
//     observation may differ in context across events.
//
// Returns the cached report_analyses row if found, or null.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CachedAnalysis {
  reportId: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  structuredObservation: Record<string, unknown>;
}

/**
 * Look up an existing analysis for the same (event_id, sha256) so the
 * caller can skip the model call. Returns null if no cached analysis
 * exists, OR if the existing report is in a non-analyzed state
 * (uploaded/analyzing/retryable_error/needs_manual_review — the
 * cached analysis would be incomplete or failed).
 *
 * Per the brief's "Avoid endless retries or repeated cost-incurring
 * requests": if the existing report is in retryable_error, we do NOT
 * reuse its (failed) analysis — we let the new report run its own
 * analysis. (We could retry the existing report instead, but that's
 * a different workflow; the new report's analyze route will be
 * called and the rate-limit ceilings will catch the runaway.)
 */
export async function lookupCachedAnalysis(args: {
  eventId: string;
  sha256: string;
}): Promise<CachedAnalysis | null> {
  const supabase = await createSupabaseServerClient();
  // Find a report in this event with the same sha256 that has a
  // successful analysis. The RLS policy reports_select_creator_or_
  // event_reviewer_or_admin restricts to what the user can see.
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, status, report_analyses(model_id, prompt_version, schema_version, processing_status, structured_observation)",
    )
    .eq("event_id", args.eventId)
    .eq("sha256", args.sha256)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const report = data[0];
  // Only reuse the analysis if the existing report is in needs_review
  // or reviewed (i.e., the analysis SUCCEEDED). For other states
  // (uploaded/analyzing/retryable_error/needs_manual_review), the
  // analysis is incomplete or failed — don't reuse it.
  if (report.status !== "needs_review" && report.status !== "reviewed") {
    return null;
  }
  const analyses = report.report_analyses ?? [];
  if (analyses.length === 0) return null;
  const a = analyses[0];
  if (!a || a.processing_status !== "succeeded") return null;
  return {
    reportId: report.id,
    modelId: a.model_id,
    promptVersion: a.prompt_version,
    schemaVersion: a.schema_version,
    structuredObservation: a.structured_observation as Record<string, unknown>,
  };
}
