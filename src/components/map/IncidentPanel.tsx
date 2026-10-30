// src/components/map/IncidentPanel.tsx
//
// The floating right panel on the map. Shows the selected pin's
// details: a thumbnail (fetched client-side via the signed URL),
// the SealBadge, the summary, and a link to the full review.
//
// On mobile (≤899px) the CSS `.map-panel` collapses to a bottom
// sheet.
//
// Server-component friendly — but the thumbnail is fetched by
// `ReportThumb` (a client component). The panel itself reads the
// report row data passed as props.

import Link from "next/link";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "@/components/report/ReportThumb";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { cn } from "@/lib/utils";

export interface IncidentPanelData {
  id: string;
  status: string;
  review_outcome: string | null;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  location_label: string | null;
  uploaded_at: string;
  priority_score: number | null;
  severity?: number | null;
  incidentType?: string | null;
  summary?: string | null;
}

export interface IncidentPanelProps {
  report: IncidentPanelData;
  reviewerName?: string | null;
  onClose?: () => void;
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

export function IncidentPanel({ report, reviewerName, onClose, className }: IncidentPanelProps) {
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const sev = toSeverityLevel(report.severity);
  const title = report.incidentType
    ? INCIDENT_LABEL[report.incidentType] ?? report.incidentType
    : report.title || `Report ${report.id.slice(0, 8)}`;

  return (
    <aside className={cn("map-panel", className)} aria-label="Selected incident">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close incident details"
          style={{ position: "absolute", right: "var(--s-2)", top: "var(--s-2)",
            zIndex: 2, minWidth: 44, minHeight: 44, borderRadius: "50%",
            background: "var(--sheet)", border: "1px solid var(--rule)", cursor: "pointer" }}>
          ×
        </button>
      )}
      <ReportThumb reportId={report.id} state={state} alt={title} className="map-panel__thumb" />
      <div className="map-panel__body">
        <SealBadge state={state} reviewerName={reviewerName} />
        <h3 style={{ fontSize: "var(--step-1)" }}>{title}</h3>
        {report.summary && <p className="t-meta">{report.summary}</p>}
        <div className="t-meta num">
          Severity {sev} · Priority {report.priority_score ?? "—"}
        </div>
        <div className="t-meta">{formatRelativeTime(report.uploaded_at)}</div>
        <Link
          href={`/reports/${report.id}`}
          className="btn btn--primary"
          style={{ marginTop: "var(--s-2)", justifySelf: "start" }}
        >
          View full report
        </Link>
      </div>
    </aside>
  );
}
