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
  action: z.enum(["confirm", "flag", "reject", "resolve", "request_info", "correct", "comment"]),
  requestId: z.string().uuid().optional(),
  comment: z.string().max(5000).optional(),
  correctedIncidentType: z.enum(["flooding", "blocked_road", "debris", "visible_structural_damage", "other", "unclear"]).optional(),
  correctedSeverity: z.number().int().min(1).max(5).nullable().optional(),
  correctedSummary: z.string().min(1).max(1000).optional(),
  correctedSummaryTl: z.string().min(1).max(1000).optional(),
  correctedUncertainties: z.array(z.string().max(300)).max(10).optional(),
  correctedVisibleEvidence: z.array(z.string().max(500)).max(20).optional(),
  reason: z.string().max(2000).optional(),
}).strict();

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

  // Serialize corrections as an allowlisted set of observation fields.
  // The SECURITY DEFINER RPC validates the same fields and the actor
  // again, so users cannot bypass route validation by calling PostgREST.
  const corrections: Record<string, unknown> = {};
  if (body.correctedIncidentType !== undefined) corrections.incident_type = body.correctedIncidentType;
  if (body.correctedSeverity !== undefined) corrections.preliminary_severity = body.correctedSeverity;
  if (body.correctedSummary !== undefined) corrections.summary_en = body.correctedSummary;
  if (body.correctedSummaryTl !== undefined) corrections.summary_tl = body.correctedSummaryTl;
  if (body.correctedUncertainties !== undefined) corrections.uncertainties = body.correctedUncertainties;
  if (body.correctedVisibleEvidence !== undefined) corrections.visible_evidence = body.correctedVisibleEvidence;

  const hasCorrections = Object.keys(corrections).length > 0;
  const isCorrectionAction = body.action === "correct" || body.action === "comment";
  if (hasCorrections !== isCorrectionAction) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Use the correction action with one or more changed fields." } },
      { status: 400 },
    );
  }
  if ((isCorrectionAction || body.action === "reject") && !body.reason?.trim()) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "A reason is required for corrections and rejections." } },
      { status: 400 },
    );
  }

  // The database locks the report row and writes review_actions,
  // report status and corrected observations in ONE transaction.
  // If any part fails, the entire transaction rolls back.
  // The request ID makes retries safe after a lost network response.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_review_atomic", {
    p_report_id: id,
    p_request_id: body.requestId ?? crypto.randomUUID(),
    p_action: body.action,
    p_comment: body.comment ?? null,
    p_reason: body.reason ?? null,
    p_corrections: corrections,
  });

  if (error) {
    const code = error.code;
    const status = code === "42501" ? 403
      : code === "22023" ? 400
      : code === "P0002" ? 404
      : code === "P0001" ? 409
      : 503;
    const message = status === 403 ? "Review permission denied."
      : status === 400 ? "Invalid review action or correction."
      : status === 404 ? "Report unavailable."
      : status === 409 ? "The report changed. Refresh before reviewing."
      : "Review service is unavailable or its database migration is pending.";
    console.error("[review] Atomic review RPC failed", { code: code ?? "unknown" });
    return NextResponse.json(
      { error: { code: "REVIEW_FAILED", message } },
      { status },
    );
  }

  if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
    return NextResponse.json(
      { error: { code: "REVIEW_FAILED", message: "Review result could not be confirmed." } },
      { status: 503 },
    );
  }
  return NextResponse.json(data);
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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, actions: actions ?? [] });
}
