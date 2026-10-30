// src/app/api/reports/[id]/review/route.ts
//
// POST /api/reports/[id]/review
//
// Reviewer action endpoint. Per the brief:
//   - "Reviewer can confirm, correct, reject, or request more
//     information."
//   - "Preserve original model output and separately store reviewer
//     corrections with reviewer ID, timestamp, before/after
//     differences, and reason."
//   - "Verify role/event permission on every mutation."
//   - "Add field verification as explicitly human-reported, not
//     model-derived."
//   - "Any correction must update visible review status and audit
//     trail."
//   - "Gate: contributor cannot review; authorized reviewer can
//     change fields and history remains intact."

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const reviewActionSchema = z.object({
  action: z.enum(["confirm", "flag", "reject", "resolve", "request_info"]),
  comment: z.string().max(5000).optional(),
  correctedIncidentType: z.string().optional(),
  correctedSeverity: z.number().int().min(1).max(5).nullable().optional(),
  correctedSummary: z.string().max(1000).optional(),
  correctedSummaryTl: z.string().max(1000).optional(),
  correctedUncertainties: z.array(z.string().max(300)).max(10).optional(),
  correctedVisibleEvidence: z.array(z.string().max(500)).max(20).optional(),
  reason: z.string().max(2000).optional(),
});

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

  // Role gate: contributor CANNOT review.
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only reviewers and admins can perform review actions." } },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body;
  try {
    body = reviewActionSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid review action payload." } },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, status, creator_id, event_id")
    .eq("id", id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // Self-review check (non-admin).
  if (report.creator_id === user.id && ctx.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You cannot review your own report." } },
      { status: 403 },
    );
  }

  const reviewableStates = ["needs_review", "needs_manual_review", "reviewed"];
  if (!reviewableStates.includes(report.status)) {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: `Cannot review a report in state '${report.status}'.` } },
      { status: 409 },
    );
  }

  // Fetch current analysis for before/after.
  const { data: analysis } = await supabase
    .from("report_analyses")
    .select("structured_observation, severity_score")
    .eq("report_id", id)
    .single();

  const currentObservation = (analysis?.structured_observation as Record<string, unknown>) ?? {};
  const currentSeverity = analysis?.severity_score ?? null;

  // Map action → schema action + outcome.
  const schemaAction = body.action === "request_info" ? "flag" : body.action;
  const reviewOutcomeMap: Record<string, string> = {
    confirm: "confirmed",
    flag: "flagged",
    reject: "rejected",
    resolve: "resolved",
    request_info: "flagged",
  };
  const reviewOutcome = reviewOutcomeMap[body.action] ?? "flagged";
  const newStatus = "reviewed";

  // Build corrected observation if corrections provided.
  let newObservation: Record<string, unknown> | null = null;
  let newSeverity: number | null | undefined = undefined;

  const hasCorrections =
    body.correctedIncidentType !== undefined ||
    body.correctedSeverity !== undefined ||
    body.correctedSummary !== undefined ||
    body.correctedSummaryTl !== undefined ||
    body.correctedUncertainties !== undefined ||
    body.correctedVisibleEvidence !== undefined;

  if (hasCorrections) {
    if (!body.reason || body.reason.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "A reason is required when correcting fields." } },
        { status: 400 },
      );
    }
    newObservation = { ...currentObservation };
    if (body.correctedIncidentType !== undefined) {
      newObservation.incident_type = body.correctedIncidentType;
      newObservation._incident_type_verified_by = user.id;
      newObservation._incident_type_verified_at = new Date().toISOString();
    }
    if (body.correctedSeverity !== undefined) {
      newObservation.preliminary_severity = body.correctedSeverity;
      newObservation._severity_verified_by = user.id;
      newObservation._severity_verified_at = new Date().toISOString();
      newSeverity = body.correctedSeverity * 20;
    }
    if (body.correctedSummary !== undefined) {
      newObservation.summary_en = body.correctedSummary;
      newObservation._summary_en_verified_by = user.id;
    }
    if (body.correctedSummaryTl !== undefined) {
      newObservation.summary_tl = body.correctedSummaryTl;
      newObservation._summary_tl_verified_by = user.id;
    }
    if (body.correctedUncertainties !== undefined) {
      newObservation.uncertainties = body.correctedUncertainties;
    }
    if (body.correctedVisibleEvidence !== undefined) {
      newObservation.visible_evidence = body.correctedVisibleEvidence;
    }
  }

  // Insert review_action (append-only — preserves before/after).
  const { error: actionErr } = await supabase.from("review_actions").insert({
    report_id: id,
    reviewer_id: user.id,
    action: schemaAction,
    comment: body.comment ?? body.reason ?? null,
    previous_status: report.status,
    new_status: newStatus,
    previous_observation: hasCorrections ? currentObservation : null,
    new_observation: newObservation,
    previous_severity: currentSeverity,
    new_severity: newSeverity ?? null,
  });

  if (actionErr) {
    return NextResponse.json(
      { error: { code: "INSERT_FAILED", message: actionErr.message } },
      { status: 500 },
    );
  }

  // Update report status + review_outcome.
  const { error: updateErr } = await supabase
    .from("reports")
    .update({ status: newStatus, review_outcome: reviewOutcome })
    .eq("id", id)
    .in("status", reviewableStates);

  if (updateErr) {
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: updateErr.message } },
      { status: 500 },
    );
  }

  // If corrections, update the analysis (preserving original model output).
  if (hasCorrections && newObservation && analysis) {
    const originalModelOutput =
      (currentObservation._original_model_output as Record<string, unknown>) ?? currentObservation;
    const updated = {
      ...newObservation,
      _original_model_output: originalModelOutput,
      _corrected_by: user.id,
      _corrected_at: new Date().toISOString(),
      _correction_reason: body.reason,
    };
    await supabase
      .from("report_analyses")
      .update({
        structured_observation: updated,
        ...(newSeverity !== undefined ? { severity_score: newSeverity } : {}),
      })
      .eq("report_id", id);
  }

  return NextResponse.json({
    ok: true,
    reportId: id,
    action: body.action,
    newStatus,
    reviewOutcome,
    correctionsApplied: hasCorrections,
    reviewerId: user.id,
    reviewedAt: new Date().toISOString(),
  });
}

/**
 * GET /api/reports/[id]/review — fetch the review action history.
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
  const { data: actions, error } = await supabase
    .from("review_actions")
    .select("id, reviewer_id, action, comment, previous_status, new_status, previous_observation, new_observation, previous_severity, new_severity, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, actions: actions ?? [] });
}
