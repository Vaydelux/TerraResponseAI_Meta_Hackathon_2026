// src/app/api/reports/[id]/force-manual-review/route.ts
//
// POST /api/reports/[id]/force-manual-review
//
// Transition a report from `analyzing`, `retryable_error`, or
// `needs_review` to `needs_manual_review` WITHOUT a model call.
// Per the brief:
//   - "safe retry buttons"
//   - "Avoid endless retries or repeated cost-incurring requests."
//
// This is the "Force manual review" affordance the BUILD_PLAN.md §3.3
// specifies: a reviewer can stop the retry loop (or the stuck
// `analyzing` state) and transition the report to manual review.
// No model call → no cost → no rate-limit/ceiling impact.
//
// Authorization:
//   - Reviewer or admin (the contributor CANNOT force-review their
//     own report — same rule as POST /api/reports/[id]/review).
//   - The event reviewer+ check is enforced by RLS + the getAuthContext
//     membership check.
//
// Body: { reason?: string } — the reviewer's reason for forcing manual
//   review (logged to last_error on the report row).
//
// Returns:
//   200 { ok: true, status: "needs_manual_review" }
//   404 NOT_FOUND (the report doesn't exist or RLS denied the read)
//   403 FORBIDDEN (the contributor tried to force-review their own
//     report, or the user is not a reviewer/admin)
//   409 INVALID_STATE (the report is in a state that can't be force-
//     reviewed: uploaded, needs_manual_review, or reviewed)

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { decideForceManualReview } from "@/lib/ai/safe-retry";

const FORCEABLE_STATES = new Set(["analyzing", "retryable_error", "needs_review"]);

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

  // 1. Fetch the report (RLS: creator OR event reviewer+). The
  //    membership check below is belt-and-suspenders.
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, event_id, creator_id, status")
    .eq("id", id)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 2. Role gate: reviewer or admin only. The contributor cannot
  //    force-review their own report (the contributor-cannot-review
  //    rule, applied to the force-manual-review action too).
  if (ctx.user.role !== "admin") {
    const membership = ctx.events.find((e) => e.event_id === report.event_id);
    if (!membership || (membership.role !== "reviewer" && membership.role !== "coordinator")) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only reviewers, coordinators, and admins can force manual review.",
          },
        },
        { status: 403 },
      );
    }
    // Self-review check: a reviewer can't force-review their own
    // report (the contributor-cannot-review rule).
    if (report.creator_id === user.id) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You cannot force-review your own report.",
          },
        },
        { status: 403 },
      );
    }
  }

  // 3. State gate: only analyzing / retryable_error / needs_review
  //    can be force-reviewed.
  const decision = decideForceManualReview(report.status);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: decision.reason } },
      { status: 409 },
    );
  }

  // 4. Parse the optional reason.
  let body: { reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine.
  }
  const reason = typeof body.reason === "string" && body.reason.length > 0
    ? body.reason.slice(0, 1000)
    : "Reviewer forced manual review (no reason given).";

  // 5. Transition to needs_manual_review (CAS: only if the state is
  //    still one of the forceable states — defends against a race
  //    where another reviewer already acted).
  const { data: updated, error: updErr } = await supabase
    .from("reports")
    .update({
      status: "needs_manual_review",
      last_error: `Force-manual-review by ${ctx.user.role}: ${reason}`,
    })
    .eq("id", id)
    .in("status", Array.from(FORCEABLE_STATES))
    .select("id, status")
    .maybeSingle();

  if (updErr || !updated) {
    return NextResponse.json(
      {
        error: {
          code: "STATE_TRANSITION_FAILED",
          message: updErr?.message ?? "Another request already changed this report's state.",
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status: "needs_manual_review" });
}
