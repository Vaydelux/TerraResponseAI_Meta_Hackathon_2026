// Shared domain types for TerraResponse AI.
// Prisma fields stored as String (SQLite has no native enum) are typed here
// as unions so the rest of the app gets compile-time safety.

export const ROLES = ["REPORTER", "REVIEWER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const REPORT_STATUSES = [
  "UPLOADED",
  "ANALYZING",
  "ANALYZED",
  "IN_REVIEW",
  "CONFIRMED",
  "FLAGGED",
  "REJECTED",
  "RESOLVED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REVIEW_ACTIONS = [
  "CONFIRM",
  "FLAG",
  "REJECT",
  "RESOLVE",
  "ASSIGN",
  "COMMENT",
] as const;
export type ReviewActionType = (typeof REVIEW_ACTIONS)[number];

export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "AUTH_FAILED",
  "UPLOAD",
  "ANALYZE",
  "REVIEW",
  "DELETE",
  "STATUS_CHANGE",
  "PERMISSION_DENIED",
  "REGISTER",
] as const;
export type AuditActionType = (typeof AUDIT_ACTIONS)[number];

export const LOCATION_ACCURACY = ["high", "medium", "low", "unknown"] as const;
export type LocationAccuracy = (typeof LOCATION_ACCURACY)[number];

// Severity buckets for explainable prioritization.
// `threshold` is the inclusive lower bound: a score >= threshold falls in
// that band. Bands are sorted descending so the first match wins.
export const SEVERITY_BANDS = [
  { threshold: 75, label: "Critical" },
  { threshold: 50, label: "High" },
  { threshold: 25, label: "Medium" },
  { threshold: 1, label: "Low" },
  { threshold: 0, label: "Minimal" },
] as const;

export function severityBand(score: number): string {
  for (const b of SEVERITY_BANDS) if (score >= b.threshold) return b.label;
  return "Minimal";
}

// (NextAuth module augmentations removed — the app now uses Supabase
// auth. The Role / status unions above are still the canonical types
// for the application layer; the Supabase profile stores role as
// lowercase text and the UI bridges it via navRole() in header.tsx.)
