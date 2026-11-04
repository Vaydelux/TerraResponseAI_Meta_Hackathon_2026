import type { ReportRowData } from "@/components/report/ReportRow";

/** Shared boundary for authorized data and explicitly selected rehearsal fixtures. */
export interface WorkspaceReport extends ReportRowData {
  summary?: string | null;
  model_id?: string | null;
  retention_state?: string;
}

export interface IncidentWorkspaceSnapshot {
  eventId: string;
  eventName: string;
  reports: WorkspaceReport[];
  totalCount: number | null;
  fetchedAt: string;
  state: "ready" | "partial" | "unavailable";
  /** The event contains more authorized reports than the loaded result window. */
  windowLimited?: boolean;
  message?: string;
}

export type HazardFilter =
  | "all" | "flood" | "hazmat" | "medical"
  | "structural" | "road" | "debris" | "other";

/** Categories come from explicit report types, never title keywords or severity. */
export function classifyHazard(report: WorkspaceReport): Exclude<HazardFilter, "all"> {
  switch (report.incident_type?.trim().toLowerCase()) {
    case "flood":
    case "flooding": return "flood";
    case "fire":
    case "wildfire":
    case "hazmat":
    case "hazardous_material": return "hazmat";
    case "medical":
    case "medical_emergency":
    case "rescue": return "medical";
    case "structural":
    case "structural_damage":
    case "visible_structural_damage": return "structural";
    case "road":
    case "blocked_road": return "road";
    case "debris": return "debris";
    default: return "other";
  }
}

export function hasMapLocation(report: WorkspaceReport): boolean {
  return report.location_source !== "unknown" &&
    typeof report.latitude === "number" && Number.isFinite(report.latitude) &&
    typeof report.longitude === "number" && Number.isFinite(report.longitude) &&
    Math.abs(report.latitude) <= 90 && Math.abs(report.longitude) <= 180;
}

export function reportTitle(report: Pick<WorkspaceReport, "id" | "title">): string {
  return report.title?.trim() || `Report ${report.id.slice(0, 8)}`;
}

function uploadedTime(report: WorkspaceReport): number | null {
  const time = Date.parse(report.uploaded_at);
  return Number.isFinite(time) ? time : null;
}

export function getTimeBounds(reports: WorkspaceReport[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const report of reports) {
    const time = uploadedTime(report);
    if (time !== null) {
      min = Math.min(min, time);
      max = Math.max(max, time);
    }
  }
  return Number.isFinite(min) ? { min, max } : null;
}

export interface WorkspaceFilters {
  hazard: HazardFilter;
  query: string;
  cutoff: number | null;
  sort: "priority" | "newest";
}

export function filterWorkspaceReports(
  reports: WorkspaceReport[],
  { hazard, query, cutoff, sort }: WorkspaceFilters,
): WorkspaceReport[] {
  const search = query.trim().toLowerCase();
  return reports.filter((report) => {
    if ((report.retention_state && report.retention_state !== "active") ||
        report.review_outcome === "rejected" || report.status === "rejected") return false;
    if (hazard !== "all" && classifyHazard(report) !== hazard) return false;
    if (cutoff !== null) {
      const time = uploadedTime(report);
      if (!Number.isFinite(cutoff) || time === null || time > cutoff) return false;
    }
    if (!search) return true;
    return [report.id, report.title, report.description, report.location_label,
      report.incident_type, report.summary].some((value) => value?.toLowerCase().includes(search));
  }).sort((a, b) => {
    if (sort === "priority") {
      const aScore = typeof a.priority_score === "number" && Number.isFinite(a.priority_score)
        ? a.priority_score : -1;
      const bScore = typeof b.priority_score === "number" && Number.isFinite(b.priority_score)
        ? b.priority_score : -1;
      if (aScore !== bScore) return bScore - aScore;
    }
    // Unavailable dates sort last. IDs provide a stable tie-breaker across refreshes.
    const aTime = uploadedTime(a);
    const bTime = uploadedTime(b);
    if (aTime !== bTime) {
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    }
    return a.id.localeCompare(b.id);
  });
}
