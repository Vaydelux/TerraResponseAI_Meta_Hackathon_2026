// src/app/api/reports/[id]/segment/route.ts
//
// POST /api/reports/[id]/segment
//
// Opt-in SAM 3.1 segmentation overlay. Per the brief:
//   - "Integrate sam-3.1 as an optional secondary operation after
//     valid Muse Spark analysis."
//   - "Skip segmentation by default for every upload."
//   - "Apply separate rate/cost limits."
//   - "If SAM is unavailable, errors, or produces no matches, the
//     rest of the report must remain completely usable."
//   - "Store only authorized overlay artifacts and relevant model
//     metadata."
//
// Prerequisites:
//   - The report MUST be in `needs_review` or `reviewed` state (the
//     Muse Spark analysis must have completed first). The brief:
//     "after valid Muse Spark analysis."
//   - The analysis MUST have a segmentation_target (or the caller
//     provides one in the request body).
//   - SAM_API_KEY must be set (the endpoint returns 503 NOT_CONFIGURED
//     without it — the "skip by default" behavior).

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl, serviceRoleKey } from "@/lib/supabase/env";
import { segmentImage, isSamConfigured } from "@/lib/ai/sam";
import { checkAllAiCallCeilings } from "@/lib/rate-limit";
import { logUsage } from "@/lib/ai/usage-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }

  if (!isSamConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "SAM_API_KEY is not set. Segmentation is skipped by default." } },
      { status: 503 },
    );
  }

  // 1. Identity + event authorization.
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }
  // Paid segmentation is a reviewer-only, opt-in operation. Ownership of
  // a report does not grant the reporter authority to spend SAM credits.
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Reviewer access required for segmentation." } },
      { status: 403 },
    );
  }

  const { id } = await params;

  // 2. Fetch the report (RLS-enforced).
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, event_id, creator_id, retention_state, status, derivative_storage_key, image_width, image_height")
    .eq("id", id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 3. The report MUST be in needs_review or reviewed (analysis done).
  // Global reviewer role alone is not enough to operate on an
  // unrelated workspace; global admins remain explicitly authorized.
  if (ctx.user.role !== "admin" &&
      !ctx.events.some((e) => e.event_id === report.event_id &&
        (e.role === "reviewer" || e.role === "coordinator"))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Event reviewer access required." } },
      { status: 403 },
    );
  }

  if (ctx.user.role !== "admin" && report.creator_id === user.id) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "You cannot request paid segmentation for your own report." } }, { status: 403 });
  }
  if (report.retention_state !== "active") {
    return NextResponse.json({ error: { code: "EVIDENCE_UNAVAILABLE", message: "Evidence has been removed or is unavailable." } }, { status: 410 });
  }
  if (!["needs_review", "reviewed", "needs_manual_review"].includes(report.status)) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "The report is not yet ready for reviewer-guided segmentation." } }, { status: 409 });
  }

  // 4. Parse the optional request body (the caller can override the
  //    segmentation target).
  let body: { prompt?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — we'll use the analysis's segmentation_target.
  }
  if (body.prompt !== undefined && typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Segmentation target must be text." } },
      { status: 400 },
    );
  }
  const userPrompt = body.prompt?.trim();
  if (report.status === "needs_manual_review" && !userPrompt) {
    return NextResponse.json({ error: { code: "MANUAL_TARGET_REQUIRED",
      message: "Muse analysis was unavailable. Enter a concrete mask target to request optional SAM." } }, { status: 422 });
  }
  if (userPrompt && (userPrompt.length < 2 || userPrompt.length > 100)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Mask target must contain 2–100 characters." } }, { status: 400 });
  }

  // 5. Fetch the Muse Spark analysis to get the segmentation_target.
  const { data: analysis, error: analysisError } = await supabase
    .from("report_analyses")
    .select("structured_observation, processing_status, raw_usage_metadata")
    .eq("report_id", id)
    .single();
  if (analysisError || !analysis) {
    return NextResponse.json(
      { error: { code: "NO_ANALYSIS", message: "A saved Meta observation is required for segmentation." } },
      { status: 409 },
    );
  }

  const observed = analysis.processing_status === "succeeded"
    ? analysis.structured_observation as { segmentation_target?: string | null } | null : null;
  const analysisTarget = observed?.segmentation_target ?? null;
  const prompt = userPrompt || analysisTarget;

  if (!prompt) {
    return NextResponse.json(
      { error: { code: "NO_TARGET", message: "No segmentation target provided. The Muse Spark analysis did not produce one, and no prompt was supplied in the request." } },
      { status: 422 },
    );
  }

  const priorMetadata = (analysis.raw_usage_metadata ?? {}) as Record<string, unknown>;
  const previouslySaved = priorMetadata._sam_overlay as
    | { format?: string; masks?: unknown[]; prompt?: string; created_at?: string }
    | undefined;
  if (previouslySaved?.format === "meta-sam-mask-v1" &&
      Array.isArray(previouslySaved.masks) && previouslySaved.masks.length > 0 &&
      previouslySaved.prompt === prompt) {
    return NextResponse.json({ ok: true, reportId: id, overlay: previouslySaved, fromCache: true });
  }
  const lastAttemptAt = previouslySaved?.created_at ? Date.parse(previouslySaved.created_at) : NaN;
  if (Number.isFinite(lastAttemptAt) &&
      lastAttemptAt <= Date.now() && Date.now() - lastAttemptAt < 15 * 60 * 1000) {
    return NextResponse.json(
      { error: { code: "SEGMENTATION_COOLDOWN", message: "Wait before requesting a different segmentation target." } },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const budget = await checkAllAiCallCeilings({ userId: user.id, eventId: report.event_id });
  if (!budget.ok) {
    return NextResponse.json(
      { error: { code: budget.code, message: budget.message } },
      { status: budget.code === "AI_BUDGET_UNAVAILABLE" ? 503 : 429 },
    );
  }

  // 6. Download the derivative from private storage.
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dervKey = report.derivative_storage_key;
  if (!dervKey || !dervKey.includes("/")) {
    return NextResponse.json(
      { error: { code: "NO_DERIVATIVE", message: "The report has no derivative image." } },
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
    return NextResponse.json(
      { error: { code: "DOWNLOAD_FAILED", message: "Could not download the derivative image." } },
      { status: 500 },
    );
  }

  const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());

  // 7. Call SAM 3.1 (no retries — the brief says "failure and no-match
  //    states are tested", and the report remains usable regardless).
  const result = await segmentImage({
    imageBytes,
    imageMimeType: "image/jpeg",
    prompt,
  });
  await logUsage({
    reportId: id, eventId: report.event_id, userId: user.id,
    modelId: "sam-3.1", promptVersion: "segmentation-v1",
    schemaVersion: "sam-rle-v1",
    outcome: result.ok ? "succeeded" :
      result.kind === "permanent" || result.kind === "not_configured" ? "permanent_failed" :
      "transient_failed",
    errorMessage: result.ok ? null : result.error,
    usage: result.ok ? {
      prompt_tokens: typeof result.usageMetadata.prompt_tokens === "number"
        ? result.usageMetadata.prompt_tokens : null,
      completion_tokens: typeof result.usageMetadata.completion_tokens === "number"
        ? result.usageMetadata.completion_tokens : null,
      total_tokens: typeof result.usageMetadata.total_tokens === "number"
        ? result.usageMetadata.total_tokens : null,
    } : null,
  });

  if (!result.ok) {
    // SAM failed or produced no match — the report stays usable.
    // Return the error but DON'T change the report's status.
    const statusCode =
      result.kind === "not_configured" ? 503 :
      result.kind === "no_match" ? 200 : // 200 with a no-match flag
      result.kind === "timeout" ? 504 :
      result.kind === "permanent" ? 422 :
      503; // transient

    return NextResponse.json(
      {
        ok: false,
        kind: result.kind,
        error: result.error,
        // The report remains usable — the client shows the error
        // but the original report/analysis is untouched.
        reportUsable: true,
      },
      { status: statusCode },
    );
  }

  // 8. Store the overlay artifact (the RLE mask + metadata) in the
  //    report_analyses row as a jsonb field. We don't store the mask
  //    as a separate image — the client renders the RLE overlay.
  const overlayData = {
    format: "meta-sam-mask-v1",
    masks: result.masks,
    score: result.score,
    image_width: result.imageWidth || report.image_width,
    image_height: result.imageHeight || report.image_height,
    model_id: result.modelId,
    prompt: result.prompt,
    usage: result.usageMetadata,
    ai_generated: true, // always mark as AI-generated
    created_at: new Date().toISOString(),
  };

  // Strict Meta observations are immutable. Persist optional mask metadata
  // separately through a trusted server client AFTER checking RLS and role.
  const { data: persisted, error: updateErr } = await serviceClient
    .from("report_analyses")
    .update({
      raw_usage_metadata: {
        ...priorMetadata,
        sam: result.usageMetadata,
        _sam_overlay: overlayData,
      },
    })
    .eq("report_id", id)
    .select("report_id")
    .single();

  if (updateErr || !persisted) {
    console.error("[segment] Unable to persist SAM overlay.", { code: updateErr?.code ?? "missing_row" });
    return NextResponse.json(
      { error: { code: "SEGMENTATION_SAVE_FAILED", message: "The segmentation overlay could not be saved. The report is unchanged." } },
      { status: 503 },
    );
  }

  // 9. Return the overlay data.
  return NextResponse.json({
    ok: true,
    reportId: id,
    overlay: overlayData,
  });
}

/**
 * GET /api/reports/[id]/segment — fetch the stored SAM overlay (if any).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: analysis, error } = await supabase
    .from("report_analyses")
    .select("structured_observation, raw_usage_metadata")
    .eq("report_id", id)
    .single();

  if (error || !analysis) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No analysis found for this report." } },
      { status: 404 },
    );
  }

  const metadata = analysis.raw_usage_metadata as Record<string, unknown> | null;
  const legacy = analysis.structured_observation as Record<string, unknown> | null;
  const candidate = metadata?._sam_overlay ?? legacy?._sam_overlay ?? null;
  const overlay = candidate && typeof candidate === "object" &&
    (candidate as { format?: string }).format === "meta-sam-mask-v1" &&
    Array.isArray((candidate as { masks?: unknown[] }).masks)
    ? candidate : null;

  return NextResponse.json({
    ok: true,
    hasOverlay: overlay !== null,
    overlay,
    samConfigured: isSamConfigured(),
  });
}
