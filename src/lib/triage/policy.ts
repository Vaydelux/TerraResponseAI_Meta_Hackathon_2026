import type { Observation } from "@/lib/ai/observation-schema";

export const TRIAGE_POLICY_VERSION = "report-first-v1";

export type TriageClass =
  | "critical_provisional"
  | "high_review"
  | "moderate_review"
  | "low_review"
  | "unrelated_review"
  | "uncertain_review";

export type TriageDecision = {
  triageClass: TriageClass;
  reasonCode: string;
  // NEVER infer the fact of a disaster or verification from severity.
  verificationStatus: "awaiting_human";
  publicationStatus: "private" | "public_provisional";
  notifyAdmin: boolean;
  priority: "critical" | "high" | "normal";
};

/**
 * Conservative policy. The model does not output a calibrated probability;
 * visible evidence count and uncertainty language are quality gates only.
 * No AI score automatically marks evidence confirmed. Only an explicit\n * separately gated critical policy may publish an UNVERIFIED alert; it\n * never exposes original evidence, and database triggers enforce the guard.
 */
export function decideTriage(
  observation: Pick<Observation,
    "incident_type" | "preliminary_severity" | "visible_evidence" | "uncertainties">,
  hasTrustedLocation: boolean,
  allowProvisionalPublication = false,
): TriageDecision {
  const base = {
    verificationStatus: "awaiting_human" as const,
    publicationStatus: "private" as const,
  };
  if (observation.incident_type === "other" || observation.incident_type === "unclear") {
    return { ...base, triageClass: "unrelated_review", reasonCode: "NO_RECOGNIZED_DISASTER_TYPE", notifyAdmin: false, priority: "normal" };
  }
  if (observation.preliminary_severity === null ||
      !Number.isInteger(observation.preliminary_severity) ||
      observation.preliminary_severity < 1 ||
      observation.preliminary_severity > 5) {
    return { ...base, triageClass: "uncertain_review", reasonCode: "MISSING_OR_INVALID_SEVERITY", notifyAdmin: false, priority: "normal" };
  }
  if (observation.preliminary_severity <= 2) {
    return { ...base, triageClass: "low_review", reasonCode: "LOW_SEVERITY", notifyAdmin: false, priority: "normal" };
  }
  if (observation.preliminary_severity === 3) {
    return { ...base, triageClass: "moderate_review", reasonCode: "MODERATE_SEVERITY", notifyAdmin: false, priority: "normal" };
  }
  if (observation.preliminary_severity === 4) {
    return { ...base, triageClass: "high_review", reasonCode: "HIGH_SEVERITY", notifyAdmin: true, priority: "high" };
  }
  // A severe photo with unclear evidence or uncertain geographic context
  // should be immediately escalated, not automatically treated as fact.
  const sufficientEvidence =
    observation.visible_evidence.filter(x => x.trim().length >= 6).length >= 2;
  const clearlyLocalized = hasTrustedLocation;
  const limitedUncertainty = observation.uncertainties.length <= 2;
  if (!sufficientEvidence || !clearlyLocalized || !limitedUncertainty) {
    return { ...base, triageClass: "high_review", reasonCode: "CRITICAL_WITH_UNCERTAIN_EVIDENCE", notifyAdmin: true, priority: "high" };
  }
  return { ...base, publicationStatus: allowProvisionalPublication ? "public_provisional" : "private", triageClass: "critical_provisional", reasonCode: "CRITICAL_POSSIBLE_DISASTER", notifyAdmin: true, priority: "critical" };
}
