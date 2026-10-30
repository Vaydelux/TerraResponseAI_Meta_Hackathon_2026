// src/app/api/reports/[id]/analyze/route.ts
//
// POST /api/reports/[id]/analyze
//
// Authenticated, idempotent AI analysis endpoint. Per the brief:
//   - "Build an authenticated /api/reports/[id]/analyze handler with
//     idempotent state transition uploaded → analyzing → needs_review
//     (or error/manual-review state)."
//   - "rate limit, bounded input, timeout, capped retries with backoff
//     for transient 429/5xx, structured error codes, and usage/cost
//     telemetry."
//   - "Persist model ID, prompt/schema version, timestamps, and
//     validated JSON."
//   - "Never call the model directly from the browser, and never expose
//     keys or original private bucket URLs publicly."
//
// Idempotency: if the report already has an analysis, return it
// (don't re-run the model). If the report is in `analyzing` state,
// return 409 (another request is in progress). If in `needs_review`
// or `reviewed`, return the existing analysis. If in
// `retryable_error`, allow a retry (the backoff poller or a manual
// re-trigger). If in `needs_manual_review`, return the error state.

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl, serviceRoleKey } from "@/lib/supabase/env";
import { analyzeImage, MODEL_ID } from "@/lib/ai/muse-spark";
import { withRetry } from "@/lib/ai/retry";
import { OBSERVATION_SCHEMA_VERSION } from "@/lib/ai/observation-schema";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { readCostControlConfig } from "@/lib/ai/cost-controls";
import { checkAllAiCallCeilings } from "@/lib/rate-limit";
import { lookupCachedAnalysis } from "@/lib/ai/dedup-cache";
import { logUsage } from "@/lib/ai/usage-log";
import { decideManualRetry, MAX_MANUAL_RETRIES } from "@/lib/ai/safe-retry";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }

  const apiKey = process.env.MODEL_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "MODEL_API_KEY is not set. Cannot call the Meta Model API." } },
      { status: 503 },
    );
  }

  // 1. Identity verification (server-side, JWT signature checked).
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  // 2. Event authorization (RLS-enforced profile + memberships).
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }

  const { id } = await params;

  // 3. Fetch the report (RLS-enforced: creator OR event reviewer+).
  //    Include retry_count (for the safe-retry cap) + sha256 (for the
  //    dedup cache) + event_id (for the per-event AI budget ceiling).
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, event_id, creator_id, status, derivative_storage_key, image_mime_type, sha256, retry_count")
    .eq("id", id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 4. Idempotency: check the current state.
  const status = report.status;
  if (status === "needs_review" || status === "reviewed") {
    // Already analyzed — return the existing analysis.
    const { data: existing } = await supabase
      .from("report_analyses")
      .select("model_id, prompt_version, schema_version, structured_observation, processing_status, completed_at")
      .eq("report_id", id)
      .single();
    if (existing) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        analysis: existing,
      });
    }
    // Status says analyzed but no row — treat as needs_manual_review.
  }

  if (status === "analyzing") {
    return NextResponse.json(
      { error: { code: "IN_PROGRESS", message: "Analysis is already in progress." } },
      { status: 409 },
    );
  }

  // Allow retry from retryable_error; allow first run from uploaded.
  // Block from needs_manual_review (the reviewer decided to do it manually).
  if (status === "needs_manual_review") {
    return NextResponse.json(
      { error: { code: "MANUAL_REVIEW", message: "This report was sent to manual review. A reviewer must analyze it by hand." } },
      { status: 409 },
    );
  }

  if (status !== "uploaded" && status !== "retryable_error") {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: `Cannot analyze a report in state '${status}'. Expected 'uploaded' or 'retryable_error'.` } },
      { status: 409 },
    );
  }

  // 4b. Safe-retry cap: if retry_count is already at the cap, park as
  //     needs_manual_review (don't incur another model call). The
  //     brief: "Avoid endless retries or repeated cost-incurring
  //     requests."
  const costConfig = readCostControlConfig();
  const retryDecision = decideManualRetry({
    status,
    retryCount: report.retry_count ?? 0,
    config: { maxRetries: MAX_MANUAL_RETRIES },
  });
  if (retryDecision.parkAsManualReview) {
    await markAsManualReview(id, retryDecision.reason ?? "AI retry cap reached.");
    // Log the budget-exhausted outcome (no model call → cost = 0).
    await logUsage({
      reportId: id,
      eventId: report.event_id,
      userId: user.id,
      outcome: "budget_exhausted",
      failureKind: "retry_cap_reached",
      errorMessage: retryDecision.reason,
    });
    return NextResponse.json(
      { error: { code: "RETRY_CAP_REACHED", message: retryDecision.reason } },
      { status: 409 },
    );
  }

  // 4c. Dedup cache: if another report in this event with the same
  //     sha256 already has a successful analysis, reuse it. NO model
  //     call, NO cost. The brief: "duplicate-hash cache" + "Avoid
  //     repeated cost-incurring requests."
  if (report.sha256) {
    const cached = await lookupCachedAnalysis({
      eventId: report.event_id,
      sha256: report.sha256,
    });
    if (cached) {
      // First, CAS transition to needs_review (only if still uploaded
      // or retryable_error — NOT analyzing, since another request may
      // be mid-model-call). If the CAS fails (race lost), return 409;
      // the client can retry. The cache-hit upsert is then a no-op
      // (the model call's eventual outcome overwrites it).
      const { data: casData, error: casErr } = await supabase
        .from("reports")
        .update({ status: "needs_review" })
        .eq("id", id)
        .in("status", ["uploaded", "retryable_error"])
        .select("id")
        .maybeSingle();
      if (casErr || !casData) {
        // Race lost — another request already transitioned (likely to
        // analyzing). Return 409 so the client retries; the model call
        // will produce the analysis.
        return NextResponse.json(
          { error: { code: "STATE_TRANSITION_FAILED", message: casErr?.message ?? "Another request is already processing this report." } },
          { status: 409 },
        );
      }
      // CAS succeeded — safe to upsert the cached observation.
      const { error: cacheInsertErr } = await supabase
        .from("report_analyses")
        .upsert({
          report_id: id,
          model_id: cached.modelId,
          prompt_version: cached.promptVersion,
          schema_version: cached.schemaVersion,
          structured_observation: cached.structuredObservation,
          processing_status: "succeeded",
          completed_at: new Date().toISOString(),
        }, { onConflict: "report_id" });
      // Telemetry: outcome = succeeded, cost = 0 (cache hit).
      await logUsage({
        reportId: id,
        eventId: report.event_id,
        userId: user.id,
        modelId: cached.modelId,
        promptVersion: cached.promptVersion,
        schemaVersion: cached.schemaVersion,
        outcome: "succeeded",
        errorMessage: "cache hit (no model call)",
      });
      if (cacheInsertErr) {
        // Do not claim an analysis succeeded if its observation could
        // not be persisted. Route it to human review instead.
        console.error(`[analyze] cache-hit upsert failed for ${id}: ${cacheInsertErr.message}`);
        await markAsManualReview(id, "Cached analysis could not be stored.");
        return NextResponse.json(
          { error: { code: "CACHE_SAVE_FAILED", message: "Analysis could not be saved. A reviewer must inspect the report." } },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        idempotent: true,
        cacheHit: true,
        reportId: id,
        reusedFrom: cached.reportId,
        observation: cached.structuredObservation,
      });
    }
  }

  // 4d. Cost-control ceilings: per-user AI rate, per-event budget,
  //     global daily spend + requests. Returns the FIRST failure
  //     (or ok). The caller stops at the first failure. Each failure
  //     returns a 4xx (the client should NOT retry — the ceiling is
  //     exhausted for the period). The brief: "bounded daily API
  //     spend/request ceilings (configurable)" + "per-user and per-
  //     event server-enforced rate limits."
  const ceiling = await checkAllAiCallCeilings({
    userId: user.id,
    eventId: report.event_id,
    config: costConfig,
  });
  if (!ceiling.ok) {
    // Log the rate-limited / budget-exhausted outcome (no model call).
    await logUsage({
      reportId: id,
      eventId: report.event_id,
      userId: user.id,
      outcome: ceiling.code === "EVENT_BUDGET_EXCEEDED" ? "budget_exhausted" : "rate_limited",
      failureKind: ceiling.code,
      errorMessage: ceiling.message,
    });
    return NextResponse.json(
      { error: { code: ceiling.code, message: ceiling.message, used: ceiling.used, limit: ceiling.limit } },
      { status: ceiling.code === "EVENT_BUDGET_EXCEEDED" || ceiling.code === "DAILY_SPEND_EXCEEDED" || ceiling.code === "DAILY_REQUESTS_EXCEEDED" ? 402 : 429 },
    );
  }

  // 5. Transition to `analyzing` (CAS — only if still uploaded or
  //    retryable_error). The .select() returns the updated row; if 0
  //    rows were updated (a concurrent request won the race), the
  //    returned data is null and we return 409.
  const { data: transitionData, error: transitionErr } = await supabase
    .from("reports")
    .update({ status: "analyzing" })
    .eq("id", id)
    .in("status", ["uploaded", "retryable_error"])
    .select("id")
    .single();

  if (transitionErr || !transitionData) {
    // Either an error or 0 rows updated (race lost) — another request
    // already transitioned the report. Return 409 so the client retries.
    return NextResponse.json(
      { error: { code: "STATE_TRANSITION_FAILED", message: transitionErr?.message ?? "Another request is already processing this report." } },
      { status: 409 },
    );
  }

  // 6. Fetch the derivative image from private storage (service role).
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The derivative_storage_key is "<bucket>/<path>".
  const dervKey = report.derivative_storage_key;
  if (!dervKey) {
    await markAsManualReview(id, "No derivative storage key found on the report.");
    return NextResponse.json(
      { error: { code: "NO_DERIVATIVE", message: "The report has no derivative image to analyze." } },
      { status: 422 },
    );
  }

  const slashIdx = dervKey.indexOf("/");
  const bucket = dervKey.slice(0, slashIdx);
  const path = dervKey.slice(slashIdx + 1);

  const { data: imageBlob, error: downloadErr } = await serviceClient.storage
    .from(bucket)
    .download(path);

  if (downloadErr || !imageBlob) {
    await markAsManualReview(id, `Failed to download derivative: ${downloadErr?.message ?? "unknown"}`);
    await logUsage({
      reportId: id,
      eventId: report.event_id,
      userId: user.id,
      outcome: "download_failed",
      failureKind: "download_failed",
      errorMessage: `Failed to download derivative: ${downloadErr?.message ?? "unknown"}`,
    });
    return NextResponse.json(
      { error: { code: "DOWNLOAD_FAILED", message: "Could not download the derivative image from private storage." } },
      { status: 500 },
    );
  }

  // 7. Read the image bytes.
  const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());

  // 8. Call the Meta Model API with bounded retries + a timeout.
  //    Measure the round-trip latency for the telemetry row.
  const callStart = Date.now();
  const result = await withRetry(
    () => analyzeImage({
      imageBytes,
      imageMimeType: "image/jpeg",
      timeoutMs: costConfig.modelCallTimeoutMs,
    }),
    (r) => r.ok === false && (r.kind === "transient" || r.kind === "timeout"),
  );
  const latencyMs = Date.now() - callStart;

  if (!result.ok) {
    // The retry exhausted; transition to the appropriate error state.
    if (result.kind === "schema_invalid") {
      // The model returned something that failed Zod → needs_manual_review.
      await markAsManualReview(id, result.error);
      await persistFailedAnalysis(id, result);
      await logUsage({
        reportId: id,
        eventId: report.event_id,
        userId: user.id,
        usage: null,
        latencyMs,
        outcome: "schema_invalid",
        failureKind: "schema_invalid",
        errorMessage: result.error,
      });
      return NextResponse.json(
        { error: { code: "SCHEMA_INVALID", message: "AI output did not pass validation. The report needs manual review." } },
        { status: 422 },
      );
    }

    if (result.kind === "permanent") {
      await markAsManualReview(id, result.error);
      await persistFailedAnalysis(id, result);
      await logUsage({
        reportId: id,
        eventId: report.event_id,
        userId: user.id,
        usage: null,
        latencyMs,
        outcome: "permanent_failed",
        failureKind: "permanent",
        errorMessage: result.error,
      });
      return NextResponse.json(
        { error: { code: "PERMANENT_ERROR", message: result.error, statusCode: result.statusCode } },
        { status: 502 },
      );
    }

    // Transient / timeout after all retries → retryable_error.
    await markAsRetryable(id, result.error);
    await persistFailedAnalysis(id, result);
    await logUsage({
      reportId: id,
      eventId: report.event_id,
      userId: user.id,
      usage: null,
      latencyMs,
      outcome: "transient_failed",
      failureKind: result.kind === "timeout" ? "timeout" : "transient",
      errorMessage: result.error,
    });
    return NextResponse.json(
      { error: { code: "RETRY_EXHAUSTED", message: `Model call failed after retries: ${result.error}` } },
      { status: 503 },
    );
  }

  // 9. Persist the validated analysis.
  //    Use UPSERT (not INSERT) so a re-analyze of a report that
  //    previously failed (and has a `failed` row from
  //    persistFailedAnalysis) overwrites the failed row. Without
  //    upsert, the unique constraint on report_id would reject the
  //    insert and we'd waste the model call's cost.
  const { error: insertErr } = await supabase.from("report_analyses").upsert({
    report_id: id,
    model_id: result.modelId,
    prompt_version: result.promptVersion,
    schema_version: result.schemaVersion,
    structured_observation: result.observation,
    severity_score: mapSeverity(result.observation.preliminary_severity),
    severity_uncertainty: 0.3, // default uncertainty; the model doesn't produce a CI
    raw_usage_metadata: result.usageMetadata,
    processing_status: "succeeded",
    completed_at: new Date().toISOString(),
  }, { onConflict: "report_id" });

  if (insertErr) {
    // The model succeeded but the DB insert failed — mark as
    // needs_manual_review (the reviewer can re-run or use the raw output).
    await markAsManualReview(id, `DB insert failed: ${insertErr.message}`);
    await logUsage({
      reportId: id,
      eventId: report.event_id,
      userId: user.id,
      usage: result.usageMetadata,
      latencyMs,
      outcome: "permanent_failed",
      failureKind: "db_insert_failed",
      errorMessage: `DB insert failed: ${insertErr.message}`,
    });
    return NextResponse.json(
      { error: { code: "INSERT_FAILED", message: "Model succeeded but could not persist the analysis." } },
      { status: 500 },
    );
  }

  // 10. Transition to needs_review.
  const { data: finalTransition, error: finalTransitionErr } = await supabase
    .from("reports")
    .update({ status: "needs_review" })
    .eq("id", id)
    .eq("status", "analyzing")
    .select("id")
    .maybeSingle();

  if (finalTransitionErr || !finalTransition) {
    // Inference may have succeeded but review status was not advanced.
    // Never return ok:true here; that would mislead the contributor.
    console.error(`[analyze] final review transition not confirmed for ${id}`);
    return NextResponse.json(
      { error: { code: "REVIEW_TRANSITION_PENDING", message: "AI observations were stored, but review status could not be finalized. Please check the report." } },
      { status: 503 },
    );
  }

  // 11. Log the successful AI call (cost + token counts + latency).
  //     The brief: "Log model, prompt version, requests, token/usage
  //     counts where the API provides them, latency, estimated cost
  //     with clear caveats, and failures without logging secrets or
  //     sensitive image content."
  await logUsage({
    reportId: id,
    eventId: report.event_id,
    userId: user.id,
    modelId: result.modelId,
    promptVersion: result.promptVersion,
    schemaVersion: result.schemaVersion,
    usage: result.usageMetadata,
    latencyMs,
    outcome: "succeeded",
  });

  // 12. Return the validated observation.
  return NextResponse.json(
    {
      ok: true,
      reportId: id,
      observation: result.observation,
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      schemaVersion: result.schemaVersion,
      usage: result.usageMetadata,
      latencyMs,
    },
    { status: 200 },
  );
}

// --- helpers ---

async function markAsManualReview(reportId: string, error: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("reports")
    .update({ status: "needs_manual_review", last_error: error })
    .eq("id", reportId)
    .in("status", ["uploaded", "analyzing", "retryable_error"]);
}

async function markAsRetryable(reportId: string, error: string) {
  const supabase = await createSupabaseServerClient();
  // Increment retry_count + set next_retry_at (the backoff poller reads this).
  const { data: current } = await supabase
    .from("reports")
    .select("retry_count")
    .eq("id", reportId)
    .single();
  const retryCount = (current?.retry_count ?? 0) + 1;
  const nextRetryAt = new Date(Date.now() + 10_000).toISOString(); // 10s for the first retry
  await supabase
    .from("reports")
    .update({ status: "retryable_error", last_error: error, retry_count: retryCount, next_retry_at: nextRetryAt })
    .eq("id", reportId)
    .eq("status", "analyzing"); // CAS: only if still analyzing
}

async function persistFailedAnalysis(
  reportId: string,
  result: { ok: false; kind: string; error: string; rawOutput?: string; statusCode?: number },
) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("report_analyses").upsert({
    report_id: reportId,
    model_id: MODEL_ID,
    prompt_version: PROMPT_VERSION,
    schema_version: OBSERVATION_SCHEMA_VERSION,
    structured_observation: { error: result.error, kind: result.kind },
    processing_status: result.kind === "schema_invalid" ? "schema_invalid" : "failed",
    error_message: result.error,
    completed_at: new Date().toISOString(),
  }, { onConflict: "report_id" });
}

/** Map the 1–5 severity to the 0–100 score the schema expects. */
function mapSeverity(preliminary: number | null): number | null {
  if (preliminary === null) return null;
  // 1→20, 2→40, 3→60, 4→80, 5→100
  return preliminary * 20;
}
