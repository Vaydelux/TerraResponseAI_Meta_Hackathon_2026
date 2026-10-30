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

  const { id } = await params;

  // 2. Fetch the report (RLS-enforced).
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, status, derivative_storage_key, image_width, image_height")
    .eq("id", id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 3. The report MUST be in needs_review or reviewed (analysis done).
  if (report.status !== "needs_review" && report.status !== "reviewed") {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: `Segmentation requires the report to be analyzed first (needs_review or reviewed). Current state: '${report.status}'.` } },
      { status: 409 },
    );
  }

  // 4. Parse the optional request body (the caller can override the
  //    segmentation target).
  let body: { prompt?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — we'll use the analysis's segmentation_target.
  }
  const userPrompt = body.prompt?.trim();

  // 5. Fetch the Muse Spark analysis to get the segmentation_target.
  const { data: analysis } = await supabase
    .from("report_analyses")
    .select("structured_observation")
    .eq("report_id", id)
    .single();

  const analysisTarget = (analysis?.structured_observation as any)?.segmentation_target ?? null;
  const prompt = userPrompt || analysisTarget;

  if (!prompt) {
    return NextResponse.json(
      { error: { code: "NO_TARGET", message: "No segmentation target provided. The Muse Spark analysis did not produce one, and no prompt was supplied in the request." } },
      { status: 422 },
    );
  }

  // 6. Download the derivative from private storage.
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dervKey = report.derivative_storage_key;
  if (!dervKey) {
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
    rle: result.rle,
    score: result.score,
    box: result.box,
    image_width: result.imageWidth || report.image_width,
    image_height: result.imageHeight || report.image_height,
    model_id: result.modelId,
    prompt: result.prompt,
    usage: result.usageMetadata,
    ai_generated: true, // always mark as AI-generated
    created_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("report_analyses")
    .update({
      raw_usage_metadata: {
        ...(analysis?.structured_observation as any)?.usage ?? {},
        sam: result.usageMetadata,
      },
    })
    .eq("report_id", id);

  if (updateErr) {
    // Non-fatal: the overlay is still stored in structured_observation
    // below. Log the error but don't block the response.
    console.error(`[segment] raw_usage_metadata update failed for ${id}: ${updateErr.message}`);
  }

  // Store the overlay in a separate jsonb field or in
  // structured_observation. We add it to the structured_observation
  // under a `_sam_overlay` key (prefixed with _ to avoid colliding
  // with the Zod-validated fields).
  if (analysis?.structured_observation) {
    const updated = {
      ...(analysis.structured_observation as Record<string, unknown>),
      _sam_overlay: overlayData,
    };
    await supabase
      .from("report_analyses")
      .update({ structured_observation: updated })
      .eq("report_id", id);
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
    .select("structured_observation")
    .eq("report_id", id)
    .single();

  if (error || !analysis) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No analysis found for this report." } },
      { status: 404 },
    );
  }

  const overlay = (analysis.structured_observation as any)?._sam_overlay ?? null;

  return NextResponse.json({
    ok: true,
    hasOverlay: overlay !== null,
    overlay,
    samConfigured: isSamConfigured(),
  });
}
