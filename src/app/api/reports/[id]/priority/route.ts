// src/app/api/reports/[id]/priority/route.ts
//
// GET  /api/reports/[id]/priority — compute the priority score + any
//   override history. Returns the factor breakdown, missing evidence,
//   computed score, and the override record (if any).
//
// POST /api/reports/[id]/priority — coordinator/admin override with
//   mandatory reason. Per the brief: "Permit only authorized
//   coordinator/admin to override score with mandatory reason; preserve
//   computed score, override and historical audit record separately."

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { calculatePriority, type PriorityInput } from "@/lib/priority";

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

  // Fetch the report (RLS-enforced).
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, event_id, status, sha256, captured_at, uploaded_at, priority_score")
    .eq("id", id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // Fetch the analysis (for visual severity + access disruption).
  const { data: analysis } = await supabase
    .from("report_analyses")
    .select("structured_observation, severity_score")
    .eq("report_id", id)
    .single();

  const observation = (analysis?.structured_observation as Record<string, unknown>) ?? {};
  const visualSeverity = observation.preliminary_severity as number | null ?? null;

  // Check if the report's incident_type indicates access disruption.
  const incidentType = (observation.incident_type as string) ?? "";
  const accessDisruptionReported =
    incidentType === "blocked_road" ? true : null;

  // Check if a reviewer confirmed the access disruption (from
  // review_actions with action='confirm' + a corrected incident_type
  // of blocked_road).
  const { data: reviewActions } = await supabase
    .from("review_actions")
    .select("new_observation")
    .eq("report_id", id)
    .eq("action", "confirm")
    .order("created_at", { ascending: false })
    .limit(1);

  const reviewerConfirmed = (reviewActions?.[0]?.new_observation as Record<string, unknown>)?.incident_type as string | undefined;
  const accessDisruptionVerified =
    reviewerConfirmed === "blocked_road" ? true : null;

  // Check for facility impact (verified metadata or reviewer confirm).
  // For now, we check if the observation's visible_evidence mentions a
  // critical facility AND the report has been reviewed (the reviewer
  // confirmed it). A more sophisticated check would use structured
  // facility-impact metadata.
  const facilityMentioned = ((observation.visible_evidence as string[]) ?? []).some(
    (e) => /hospital|school|power station|water treatment|fire station|shelter/i.test(e),
  );
  const isReviewed = report.status === "reviewed";
  const facilityImpactVerified =
    facilityMentioned && isReviewed ? true : null;

  // Fetch other digests in the event for corroboration.
  const { data: otherReports } = await supabase
    .from("reports")
    .select("sha256")
    .eq("event_id", report.event_id)
    .neq("id", id)
    .limit(100);

  const otherDigests = (otherReports ?? []).map((r: any) => r.sha256 as string);

  // Compute the priority.
  const input: PriorityInput = {
    visualSeverity,
    facilityImpactVerified,
    accessDisruptionReported,
    accessDisruptionVerified,
    capturedAt: report.captured_at ? new Date(report.captured_at) : null,
    uploadedAt: new Date(report.uploaded_at),
    eventCreatedAt: null,
    sha256: report.sha256,
    otherDigestsInEvent: otherDigests,
  };

  const result = calculatePriority(input);

  // Fetch any override.
  const { data: override } = await supabase
    .from("priority_overrides")
    .select("id, overridden_by, previous_score, new_score, reason, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    ok: true,
    reportId: id,
    computedScore: result.score,
    factors: result.factors,
    missingEvidence: result.missingEvidence,
    label: result.label,
    override: override?.[0] ?? null,
    displayedScore: override?.[0]?.new_score ?? result.score,
  });
}

const overrideSchema = z.object({
  newScore: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(2000),
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

  const { id } = await params;

  // Role gate: only coordinator/admin can override. Per the brief:
  // "Permit only authorized coordinator/admin to override score."
  if (ctx.user.role !== "admin") {
    // Check event-scoped coordinator role.
    const supabase = await createSupabaseServerClient();
    const { data: report } = await supabase
      .from("reports")
      .select("event_id")
      .eq("id", id)
      .single();

    if (!report) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Report not found." } },
        { status: 404 },
      );
    }

    // Check if the user is a coordinator of the report's event.
    const isCoordinator = ctx.events.some(
      (e) => e.event_id === report.event_id && e.role === "coordinator",
    );
    if (!isCoordinator) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Only coordinators and admins can override the priority score." } },
        { status: 403 },
      );
    }
  }

  let body;
  try {
    body = overrideSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid override payload. Required: newScore (0-100), reason (non-empty)." } },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Fetch the current computed score (to preserve it as previous_score).
  const { data: report } = await supabase
    .from("reports")
    .select("priority_score")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found." } },
      { status: 404 },
    );
  }

  const previousScore = report.priority_score ?? 0;

  // Insert the override (append-only — preserves history).
  const { error: insertErr } = await supabase
    .from("priority_overrides")
    .insert({
      report_id: id,
      overridden_by: user.id,
      previous_score: previousScore,
      new_score: body.newScore,
      reason: body.reason,
    });

  if (insertErr) {
    return NextResponse.json(
      { error: { code: "INSERT_FAILED", message: insertErr.message } },
      { status: 500 },
    );
  }

  // Update the report's priority_score to the overridden value.
  const { error: updateErr } = await supabase
    .from("reports")
    .update({ priority_score: body.newScore })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: updateErr.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reportId: id,
    computedScore: previousScore,
    overriddenScore: body.newScore,
    reason: body.reason,
    overriddenBy: user.id,
    overriddenAt: new Date().toISOString(),
  });
}
