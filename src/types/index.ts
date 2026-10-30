// src/types — shared domain types re-exported from src/lib/types.ts
//
// The canonical home for shared domain types is `src/lib/types.ts`
// because it contains NextAuth `declare module` augmentations that
// must be in a globally-imported file. This barrel re-exports the
// public types so consumers can import from `@/types` per the
// project convention requested in the scaffold brief, without
// breaking the Phase 1 import paths.

export {
  ROLES,
  type Role,
  REPORT_STATUSES,
  type ReportStatus,
  REVIEW_ACTIONS,
  type ReviewActionType,
  AUDIT_ACTIONS,
  type AuditActionType,
  LOCATION_ACCURACY,
  type LocationAccuracy,
  SEVERITY_BANDS,
  severityBand,
} from "@/lib/types";
