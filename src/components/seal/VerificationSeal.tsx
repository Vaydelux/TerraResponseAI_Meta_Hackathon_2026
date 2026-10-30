// src/components/seal/VerificationSeal.tsx
//
// VerificationSeal — the KEYSTONE component of the TerraResponse AI
// design system (per docs/DESIGN.md §6 + §7.1).
//
// The single memorable idea: every AI observation renders in an amber
// hatched treatment (the visual language of an unfinished survey
// drawing), and only a human review action resolves the hatching into
// a solid, signed state. Unverified information is always visibly
// unfinished; verified information is always visibly signed.
//
// Composes SealBadge + ProvenanceLine. The badge announces state
// changes through an aria-live="polite" region so screen-reader users
// hear the resolution ("Report confirmed by Maya R.").
//
// This is a Server Component — no interactivity. The resolve animation
// is driven by the `resolving` prop, which the parent (ReviewActionBar)
// sets via React state during a review action's optimistic-then-
// confirmed lifecycle.

import { type VerificationState } from "@/lib/design/status";
import { SealBadge } from "./SealBadge";
import { ProvenanceLine } from "./ProvenanceLine";

export interface VerificationSealProps {
  state: VerificationState;
  reviewerName?: string | null;
  at?: string | Date | null;
  /** True while a review action is in flight — triggers the resolve
   *  animation (seal-stamp keyframes in seal.css). The parent sets
   *  this; the Seal just renders the attribute on SealBadge. */
  resolving?: boolean;
  /** The model id (e.g. "muse-spark-1.3"). Passed to ProvenanceLine. */
  modelName?: string;
  /** If true, ProvenanceLine renders the demo-mock-v1 chip. */
  isDemo?: boolean;
  /** Compact variant for ReportRow + map pins — hides the label text
   *  (the icon + the provenance line carry the meaning). */
  compact?: boolean;
}

export function VerificationSeal({
  state,
  reviewerName,
  at,
  resolving,
  modelName,
  isDemo,
  compact,
}: VerificationSealProps) {
  // The aria-live region announces the Seal's state changes. The id
  // links SealBadge (role="img", aria-label) to the live region so
  // the badge's label is the announcement.
  const liveId = compact ? undefined : `seal-live-${state}`;
  return (
    <div className="tr-stack" style={{ gap: "var(--s-1)" }}>
      <SealBadge
        state={state}
        reviewerName={reviewerName}
        resolving={resolving}
        compact={compact}
        id={liveId}
      />
      {!compact && (
        <div aria-live="polite" aria-labelledby={liveId}>
          <ProvenanceLine
            state={state}
            modelName={modelName}
            isDemo={isDemo}
            reviewerName={reviewerName}
            at={at}
          />
        </div>
      )}
    </div>
  );
}
