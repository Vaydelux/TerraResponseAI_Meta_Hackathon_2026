// src/components/seal/SealBadge.tsx
//
// SealBadge — the badge half of the VerificationSeal (the keystone
// component of the TerraResponse AI design system, per docs/DESIGN.md
// §7.1).
//
// The badge is an inline-flex pill with an icon + label. The amber
// hatch overlay (`.seal__hatch`) only exists in the pending state; on
// resolve it wipes out left-to-right (per seal.css).
//
// This is a Server Component — no interactivity. The resolve animation
// is driven by the `data-resolving` attribute, which the parent
// (ReviewActionBar) sets via React state.

import { type VerificationState, SEAL_CLASS, resolveSealLabel } from "@/lib/design/status";

export interface SealBadgeProps {
  /** The verification state. Drives the CSS class + icon + label. */
  state: VerificationState;
  /** The reviewer's display name (for resolved states). Ignored for
   *  pending + failed. */
  reviewerName?: string | null;
  /** True while a review action is in flight — triggers the resolve
   *  animation (seal-stamp keyframes). The parent sets this; the badge
   *  just renders the attribute. */
  resolving?: boolean;
  /** Compact variant: smaller text, no icon label gap. Used in
   *  ReportRow + the map IncidentPin. */
  compact?: boolean;
  /** Optional id for aria-live association. */
  id?: string;
}

const STATE_ICONS: Record<VerificationState, { d: string; stroke?: boolean }> = {
  // pending: amber question-mark-in-circle, dashed stroke
  pending:   { d: "M9 9a3 3 0 1 1 4 3c-.7.4-1 .8-1 2M12 17h.01", stroke: true },
  // confirmed: green checkmark
  confirmed: { d: "M5 12l5 5L20 7" },
  // corrected: tide pencil
  corrected: { d: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" },
  // flagged: amber flag
  flagged:   { d: "M5 21V4M5 4h11l-2 4 2 4H5" },
  // rejected: brick X
  rejected:  { d: "M6 6l12 12M18 6L6 18" },
  // failed: graphite dashed circle with slash
  failed:    { d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5 5l14 14", stroke: true },
};

export function SealBadge({
  state,
  reviewerName,
  resolving,
  compact,
  id,
}: SealBadgeProps) {
  const className = SEAL_CLASS[state];
  const label = resolveSealLabel(state, reviewerName ?? null);
  const icon = STATE_ICONS[state];

  return (
    <span
      id={id}
      className={`seal ${className}`}
      data-resolving={resolving ? "true" : undefined}
      role="img"
      aria-label={label}
    >
      <span className="seal__hatch" aria-hidden="true" />
      <svg
        className="seal__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={icon.stroke ? 1.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={icon.stroke ? "3 2" : undefined}
        aria-hidden="true"
      >
        <path d={icon.d} />
      </svg>
      {!compact && <span>{label}</span>}
    </span>
  );
}
