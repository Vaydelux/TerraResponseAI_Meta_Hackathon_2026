/** User role and per-event permissions must both be satisfied.
 * These guards are UI affordances ONLY; server RPC/RLS authorizes again. */
export type GlobalRole = "reporter" | "reviewer" | "admin";
export type EventRole = "contributor" | "reviewer" | "coordinator" | null;

export interface ReviewCapabilitiesInput {
  globalRole: GlobalRole | string | undefined;
  eventRole: EventRole;
  actorId?: string | null;
  creatorId: string;
  status: string;
  retentionState: string | null | undefined;
}

const REVIEWABLE = new Set(["needs_review", "needs_manual_review", "reviewed"]);

export function getReviewCapabilities(input: ReviewCapabilitiesInput) {
  const admin = input.globalRole === "admin";
  const hasReviewerRole = admin || input.globalRole === "reviewer";
  const hasEventAccess = admin || input.eventRole === "reviewer" || input.eventRole === "coordinator";
  const isOwn = Boolean(input.actorId && input.actorId === input.creatorId);
  const retained = input.retentionState === "active" || input.retentionState == null;
  const canReview = hasReviewerRole && hasEventAccess && (admin || !isOwn) &&
    retained && REVIEWABLE.has(input.status);
  // Priority overrides are coordinator/admin-only by policy, independent
  // of the actor's permission to submit a review.
  const canOverridePriority = (admin || input.eventRole === "coordinator") && retained;
  const canSegment = canReview && retained;
  const reason = !hasReviewerRole
    ? "Reviewer or administrator access is required."
    : !hasEventAccess
      ? "This report belongs to an event where you have no reviewer assignment."
      : isOwn && !admin
        ? "Reviewers cannot verify their own submissions."
        : !retained
          ? "This report's evidence is unavailable under its retention status."
          : !REVIEWABLE.has(input.status)
            ? "This report is not ready for human review."
            : null;
  return { canReview, canOverridePriority, canSegment, reason, isOwn };
}
