// src/components/report/ReportCard.tsx
//
// A larger, vertical card variant for the dashboard. Uses `.panel`
// for the card chrome. Same data as ReportRow but stacked: thumbnail
// on top (a taller aspect ratio), then the seal + title, then
// severity, then the priority number on the bottom.
//
// Server-component friendly.

import Link from "next/link";
import { SealBadge } from "@/components/seal/SealBadge";
import { SeverityMeter } from "./SeverityMeter";
import { ReportThumb } from "./ReportThumb";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import type { ReportRowData } from "./ReportRow";

export interface ReportCardProps {
  report: ReportRowData;
  reviewerName?: string | null;
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

export function ReportCard({ report, reviewerName, eventName }: ReportCardProps) {
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const severity = toSeverityLevel(report.severity);
  const priority = report.priority_score ?? null;
  const title = report.incident_type
    ? INCIDENT_LABEL[report.incident_type] ?? report.incident_type
    : report.title || `Report ${report.id.slice(0, 8)}`;
  const age = formatRelativeTime(report.uploaded_at);

  return (
    <Link
      href={`/reports/${report.id}`}
      className="panel report-card"
      aria-label={`${title} — ${state}, uploaded ${age}`}
      style={{ textDecoration: "none", color: "inherit", display: "grid", gap: 12 }}
    >
      <div style={{ aspectRatio: "16 / 10", overflow: "hidden", borderRadius: "var(--r-viewer)" }}>
        <ReportThumb
          reportId={report.id}
          state={state}
          alt={title}
        />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <SealBadge state={state} reviewerName={reviewerName} />
        <h3 style={{ margin: 0, fontSize: "var(--step-2)" }}>{title}</h3>
        <div className="t-meta" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {eventName && <span>{eventName}</span>}
          {eventName && <span aria-hidden="true">·</span>}
          <span>{age}</span>
        </div>
        <SeverityMeter level={severity} state={state} />
      </div>
      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: "1px solid var(--rule)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span className="t-label">Priority</span>
        <span className="priority__score-num num" style={{ fontSize: "var(--step-3)" }}>
          {priority ?? "—"}
        </span>
      </div>
    </Link>
  );
}
