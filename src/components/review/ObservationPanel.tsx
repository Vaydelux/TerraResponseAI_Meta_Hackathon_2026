// src/components/review/ObservationPanel.tsx
//
// The right-side observation panel — the heart of the review
// workbench. Renders the AI's observation in a fixed order (per
// docs/DESIGN.md §6):
//
//   1. The Verification Seal (with the hatched band on top, only
//      wrapping the Seal + the incident heading + the summary —
//      the lower sections stay readable).
//   2. The incident type (h2).
//   3. The summary.
//   4. Severity (the SeverityMeter).
//   5. "What the model saw" (the EvidenceList).
//   6. "What the model could not determine" (the UncertaintyList —
//      deliberately the same visual weight as the evidence list).
//   7. Priority (the PriorityBreakdown).
//   8. The ReviewActionBar (sticky to the bottom; null on the read-
//      only report detail page).
//
// Server-component friendly.

import type { ReactNode } from "react";
import { VerificationSeal } from "@/components/seal/VerificationSeal";
import { HatchSurface } from "@/components/seal/HatchSurface";
import { SeverityMeter } from "@/components/report/SeverityMeter";
import { PriorityBreakdown, type PriorityFactor } from "@/components/report/PriorityBreakdown";
import { EvidenceList } from "./EvidenceList";
import { UncertaintyList } from "./UncertaintyList";
import { stateFromReport, type VerificationState } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { cn } from "@/lib/utils";

export interface ObservationData {
  /** The AI's incident_type (mapped to a human label in the panel). */
  incidentType: string | null;
  /** The AI's summary_en. */
  summary: string | null;
  /** The AI's preliminary_severity (1–5 or null). */
  severity: number | null;
  /** The AI's visible_evidence array. */
  visibleEvidence: string[];
  /** The AI's uncertainties array. */
  uncertainties: string[];
  /** The model_id of the analysis (muse-spark-1.3 or demo-mock-v1). */
  modelId?: string;
  /** True if this is a demo mock observation. */
  isDemo?: boolean;
}

export interface ObservationPanelProps {
  /** The DB report's status + review_outcome (mapped to a state). */
  status: string;
  reviewOutcome: string | null;
  /** The reviewer's display name (for resolved seals). */
  reviewerName?: string | null;
  /** ISO timestamp of the review action (resolved states). */
  reviewedAt?: string | null;
  /** True while a review action is in flight — drives the resolve
   *  animation on the Seal. */
  resolving?: boolean;
  /** The AI's observation data. */
  observation: ObservationData;
  /** The priority score + factor breakdown. */
  priorityScore: number;
  priorityFactors: PriorityFactor[];
  /** The action bar — pass null for the read-only report detail. */
  actionBar?: ReactNode;
  /** Optional override for the state — useful when the page knows
   *  the corrected state from the review_actions history. */
  stateOverride?: VerificationState;
  className?: string;
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flooding",
  blocked_road: "Blocked road",
  debris: "Debris",
  visible_structural_damage: "Visible structural damage",
  other: "Other",
  unclear: "Unclear",
};

export function ObservationPanel({
  status,
  reviewOutcome,
  reviewerName = null,
  reviewedAt = null,
  resolving = false,
  observation,
  priorityScore,
  priorityFactors,
  actionBar = null,
  stateOverride,
  className,
}: ObservationPanelProps) {
  const state: VerificationState = stateOverride ?? stateFromReport({ status, reviewOutcome: reviewOutcome });
  const severity = toSeverityLevel(observation.severity);
  const incidentLabel = observation.incidentType
    ? INCIDENT_LABEL[observation.incidentType] ?? observation.incidentType
    : "Unclear";

  return (
    <div className={cn("obs panel", className)} data-state={state}>
      <HatchSurface state={state}>
        <VerificationSeal
          state={state}
          reviewerName={reviewerName ?? null}
          at={reviewedAt}
          resolving={resolving}
          modelName={observation.modelId}
          isDemo={observation.isDemo}
        />
        <h2 className="obs__type">{incidentLabel}</h2>
        <p className="obs__summary">
          {observation.summary ?? "The model produced no summary for this photo."}
        </p>
      </HatchSurface>
      <div className="obs__section">
        <div className="obs__section-title">Severity</div>
        <SeverityMeter level={severity} state={state} />
      </div>
      <div className="obs__section">
        <div className="obs__section-title">What the model saw</div>
        <EvidenceList items={observation.visibleEvidence} />
      </div>
      <div className="obs__section">
        <div className="obs__section-title">What the model could not determine</div>
        <UncertaintyList items={observation.uncertainties} />
      </div>
      <div className="obs__section">
        <div className="obs__section-title">Priority</div>
        <PriorityBreakdown score={priorityScore} factors={priorityFactors} />
      </div>
      {actionBar}
    </div>
  );
}
