// src/components/report/ReportRow.tsx
//
// A single report row in the list. The compact, horizontal layout
// uses `.report-row` (components.css §7.8): thumbnail on the left,
// the incident info in the middle, and the priority number on the
// right. The entire row is a link to `/reports/[id]`.
//
// The thumbnail is fetched client-side (see ReportThumb) so the
// list view doesn't pay the per-row signed-URL cost. The SealBadge
// + SeverityMeter render server-side from the report's status.
//
// Server-component friendly at the row level; ReportThumb is a
// client component embedded inside it.

import Link from "next/link";
import { SealBadge } from "@/components/seal/SealBadge";
import { SeverityMeter } from "./SeverityMeter";
import { ReportThumb } from "./ReportThumb";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import type { PriorityFactor } from "./PriorityBreakdown";

export interface ReportRowData {
  id: string;
  status: string;
  review_outcome: string | null;
  title: string | null;
  description?: string | null;
  event_name?: string | null;
  location_source?: string;
  location_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  uploaded_at: string;
  captured_at?: string | null;
  priority_score?: number | null;
  /** The AI's incident_type from the analysis (if loaded). */
  incident_type?: string | null;
  /** The AI's preliminary_severity from the analysis. */
  severity?: number | null;
}

export interface ReportRowProps {
  report: ReportRowData;
  /** The display name of the reviewer (for resolved seals). */
  reviewerName?: string | null;
  /** The event name to show under the title. */
  eventName?: string | null;
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flooding",
  blocked_road: "Blocked road",
  debris: "Debris",
  visible_structural_damage: "Visible structural damage",
  other: "Other",
  unclear: "Unclear",
};

export function ReportRow({ report, reviewerName, eventName }: ReportRowProps) {
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const severity = toSeverityLevel(report.severity);
  const priority = report.priority_score ?? null;
  const title =
    report.incident_type
      ? INCIDENT_LABEL[report.incident_type] ?? report.incident_type
      : report.title || `Report ${report.id.slice(0, 8)}`;
  const age = formatRelativeTime(report.uploaded_at);

  return (
    <Link
      href={`/reports/${report.id}`}
      className="report-row"
      aria-label={`${title} — ${state}, uploaded ${age}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <ReportThumb reportId={report.id} state={state} alt={title} />
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <SealBadge state={state} reviewerName={reviewerName} />
          <h3 style={{ margin: 0, fontSize: "var(--step-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </h3>
        </div>
        <div className="t-meta" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {eventName && <span>{eventName}</span>}
          {eventName && <span aria-hidden="true">·</span>}
          <span>{age}</span>
          {report.location_source && report.location_source !== "unknown" && (
            <>
              <span aria-hidden="true">·</span>
              <span>{report.location_label || report.location_source}</span>
            </>
          )}
        </div>
        <SeverityMeter level={severity} state={state} compact />
      </div>
      <div style={{ textAlign: "right", display: "grid", gap: 2, justifyItems: "end", flex: "none" }}>
        <div className="priority__score-num num" style={{ fontSize: "var(--step-2)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {priority ?? "—"}
        </div>
        <div className="t-meta">priority</div>
      </div>
    </Link>
  );
}

export type { PriorityFactor };
