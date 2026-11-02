import type { Observation } from "@/lib/ai/observation-schema";
import type { TriageClass } from "./policy";

// The database row is authoritative once written. A retry must not replace
// or contradict a classification that was already stored or human-reviewed.
const TRIAGE_CLASSES = [
  "critical_provisional", "high_review", "moderate_review", "low_review",
  "unrelated_review", "uncertain_review",
] as const;
const VERIFICATION_STATES = ["awaiting_human", "confirmed", "rejected"] as const;
const PUBLICATION_STATES = ["private", "public_provisional", "public_verified"] as const;
const INCIDENT_TYPES = [
  "flooding", "blocked_road", "debris", "visible_structural_damage",
  "other", "unclear",
] as const;

function oneOf<T extends string>(input: unknown, values: readonly T[]): input is T {
  return typeof input === "string" && values.some((value) => value === input);
}

export function readPersistedTriage(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Saved triage is unavailable.");
  }
  const row = input as Record<string, unknown>;
  if (
    !oneOf(row.triage_class, TRIAGE_CLASSES) ||
    !oneOf(row.verification_status, VERIFICATION_STATES) ||
    !oneOf(row.publication_status, PUBLICATION_STATES) ||
    !oneOf(row.incident_type, INCIDENT_TYPES) ||
    typeof row.reason_code !== "string" || !row.reason_code ||
    typeof row.triage_policy_version !== "string" || !row.triage_policy_version
  ) {
    throw new Error("Saved triage has an invalid state.");
  }
  const triageClass: TriageClass = row.triage_class;
  const priority = triageClass === "critical_provisional" ? "critical"
    : triageClass === "high_review" ? "high" : "normal";
  return {
    triageClass,
    incidentType: row.incident_type as Observation["incident_type"],
    verificationStatus: row.verification_status,
    publicationStatus: row.publication_status,
    reasonCode: row.reason_code,
    policyVersion: row.triage_policy_version,
    priority,
    notifyAdmin: priority !== "normal",
  };
}
