// src/lib/design/status.ts
//
// Verification state vocabulary for the TerraResponse AI design system.
//
// Per docs/DESIGN.md §3 "State vocabulary (never reused for anything else)":
//   - amber hatch      = AI-generated, not verified
//   - green solid      = confirmed by a human
//   - tide solid + pencil = corrected by a reviewer
//   - amber solid + flag  = flagged for a second reviewer
//   - brick outline + strike = rejected
//   - graphite dashed  = analysis failed or unavailable
//   - flood blue       = SAM mask only (not a Seal state)
//
// The label text below is the CANONICAL copy — it is not overridable by
// props at any call site. This is the safety guarantee: no component
// can accidentally render an unlabeled observation. If a new state is
// needed, add it here + to the Seal CSS (seal.css) + to the
// SealBadge component — never bypass the central definitions.

export type VerificationState =
  | "pending"     // AI-generated, not verified (amber hatch)
  | "confirmed"   // confirmed by a human (green solid)
  | "corrected"   // corrected by a reviewer (tide solid + pencil)
  | "flagged"     // flagged for a second reviewer (amber solid + flag)
  | "rejected"    // rejected (brick outline + strike)
  | "failed";     // analysis failed or unavailable (graphite dashed)

/**
 * The canonical seal label for a given state. This is the text the
 * SealBadge renders — never overridable by call sites (per the
 * design thesis: the safety claim is "AI observations are always
 * labeled until a reviewer acts").
 *
 * The `{name}` placeholder is replaced by the reviewer's display
 * name for the resolved states (confirmed / corrected / flagged /
 * rejected). For pending + failed, no name is substituted.
 */
export const SEAL_LABEL: Record<VerificationState, string> = {
  pending:   "AI-generated, not verified",
  confirmed: "Confirmed by {name}",
  corrected: "Corrected by {name}",
  flagged:   "Flagged for second review",
  rejected:  "Rejected by {name}",
  failed:    "Analysis unavailable",
};

/**
 * Map a report row's database fields to a VerificationState.
 *
 * The mapping rules (per docs/SECURITY.md + the 0001 schema):
 *   - status='reviewed' + review_outcome='confirmed'  → confirmed
 *   - status='reviewed' + review_outcome='flagged'    → flagged
 *   - status='reviewed' + review_outcome='rejected'   → rejected
 *   - status='reviewed' + review_outcome='resolved'   → confirmed (treated as confirmed)
 *   - status='retryable_error' / status='needs_manual_review' → failed
 *   - any other status (uploaded / analyzing / needs_review)  → pending
 *
 * The 'corrected' state is set when the most recent review_action is
 * 'comment' or 'assign' with a non-null new_observation — the route
 * handler determines this from the review_actions history. This
 * helper does NOT infer 'corrected' from the report row alone;
 * callers that need the corrected state should pass it explicitly.
 */
export function stateFromReport(args: {
  status: string;
  reviewOutcome: string | null;
}): VerificationState {
  if (args.status === "reviewed") {
    if (args.reviewOutcome === "confirmed" || args.reviewOutcome === "resolved") return "confirmed";
    if (args.reviewOutcome === "flagged") return "flagged";
    if (args.reviewOutcome === "rejected") return "rejected";
    // status='reviewed' with no review_outcome — schema CHECK forbids
    // this, but defense-in-depth: treat as pending.
    return "pending";
  }
  if (args.status === "retryable_error" || args.status === "needs_manual_review") {
    return "failed";
  }
  // uploaded / analyzing / needs_review — AI observation exists but
  // no human has acted yet.
  return "pending";
}

/**
 * Resolve the seal label, substituting the reviewer's display name
 * for the {name} placeholder. For pending + failed states, the name
 * is ignored (the label has no placeholder).
 */
export function resolveSealLabel(
  state: VerificationState,
  reviewerName: string | null,
): string {
  const template = SEAL_LABEL[state];
  if (!template.includes("{name}")) return template;
  return template.replace("{name}", reviewerName ?? "a reviewer");
}

/**
 * The CSS class suffix for a given state (e.g. "seal--pending",
 * "seal--confirmed"). Kept in sync with seal.css.
 */
export const SEAL_CLASS: Record<VerificationState, string> = {
  pending:   "seal--pending",
  confirmed: "seal--confirmed",
  corrected: "seal--corrected",
  flagged:   "seal--flagged",
  rejected:  "seal--rejected",
  failed:    "seal--failed",
};
