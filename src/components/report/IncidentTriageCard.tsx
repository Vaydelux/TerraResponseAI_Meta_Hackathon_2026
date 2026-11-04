// src/components/report/IncidentTriageCard.tsx
//
// Severity-banded Incident Triage Card for the Commander Overview
// Dashboard. Matches the tactical triage layout with a top severity
// color bar, severity & report ID header, location subtitle,
// 16:10 report thumbnail with status overlay, telemetry rows, and
// a direct action button to launch the Review Workbench or inspect
// the report.

import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "./ReportThumb";
import { ShareReportButton } from "./ShareReportButton";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import type { ReportRowData } from "./ReportRow";

export interface IncidentTriageCardProps {
  report: ReportRowData;
  reviewerName?: string | null;
  eventName?: string | null;
  canReview?: boolean;
  onOpenDetails?: (report: ReportRowData) => void;
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flooding & Inundation",
  blocked_road: "Blocked Roadway / Corridor",
  debris: "Debris Field Obstruction",
  visible_structural_damage: "Visible Structural Collapse",
  other: "Field Hazard Observation",
  unclear: "Unclassified Field Report",
};

const SEVERITY_TAG: Record<number, string> = {
  5: "SEV 5 · CRITICAL PRIORITY",
  4: "SEV 4 · HIGH PRIORITY",
  3: "SEV 3 · MODERATE",
  2: "SEV 2 · ADVISORY",
  1: "SEV 1 · LOW IMPACT",
};

const LOCATION_SOURCE_LABEL: Record<string, string> = {
  exif: "EXIF GPS Telemetry",
  user_pin: "Responder Map Pin",
  manual: "Manual Coordinates",
  unknown: "Unlocated (Needs Pin)",
};

export function IncidentTriageCard({
  report,
  reviewerName,
  eventName,
  canReview = false,
  onOpenDetails,
}: IncidentTriageCardProps) {
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const severity = toSeverityLevel(report.severity);
  const priority = report.priority_score ?? null;
  const title = report.incident_type
    ? INCIDENT_LABEL[report.incident_type] ?? report.incident_type
    : report.title || `Incident Report ${report.id.slice(0, 8)}`;
  const age = formatRelativeTime(report.uploaded_at);
  const locationText =
    report.location_label ||
    (typeof report.latitude === "number" && typeof report.longitude === "number"
      ? `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`
      : "Location pending verification");
  const locSourceKey = report.location_source ?? "unknown";

  const isPending = state === "pending";
  const targetHref = canReview && isPending ? `/review/${report.id}` : `/reports/${report.id}`;
  const ctaLabel = onOpenDetails
    ? "Inspect Incident Details"
    : canReview && isPending
    ? "Launch Review Workbench"
    : "Inspect Incident Report";

  return (
    <article className="triage-card" data-sev={report.severity == null ? undefined : severity} aria-label={`${title} — ${report.severity == null ? "severity not assessed" : `provisional severity ${severity}/5`}`}>
      <div className="triage-card__stripe" aria-hidden="true" />
      <div className="triage-card__body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <span
            className="t-meta num"
            style={{
              fontWeight: 700,
              color: severity >= 4 ? "var(--brick-ink)" : severity === 3 ? "var(--amber-ink)" : "var(--tide)",
            }}
          >
            {report.severity == null ? "SEVERITY NOT ASSESSED" : SEVERITY_TAG[severity] ?? `SEV ${severity}`}
          </span>
          <span className="t-meta num">#TR-{report.id.slice(0, 6).toUpperCase()}</span>
        </div>

        <div>
          <h3 style={{ margin: 0, fontSize: "var(--step-1)", lineHeight: 1.25 }}>
            {onOpenDetails ? (
              <button
                type="button"
                onClick={() => onOpenDetails(report)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {title}
              </button>
            ) : (
              title
            )}
          </h3>
          <p className="t-meta" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} aria-hidden="true" style={{ flexShrink: 0, color: "var(--ink-3)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {locationText}
            </span>
          </p>
        </div>

        <div
          className="triage-card__media"
          onClick={onOpenDetails ? () => onOpenDetails(report) : undefined}
          style={onOpenDetails ? { cursor: "pointer" } : undefined}
        >
          <ReportThumb
            reportId={report.id}
            state={state}
            alt={title}
            className="triage-card__thumb w-full h-full object-cover"
          />
          <div className="triage-card__overlay">
            <SealBadge state={state} reviewerName={reviewerName} />
          </div>
        </div>

        <div className="triage-card__specs">
          <div className="triage-card__spec-row">
            <span className="t-meta">Location Source:</span>
            <strong className="num">{LOCATION_SOURCE_LABEL[locSourceKey] ?? locSourceKey}</strong>
          </div>
          <div className="triage-card__spec-row">
            <span className="t-meta">Priority Score · Age:</span>
            <strong
              className="num"
              style={{ color: severity >= 4 ? "var(--brick-ink)" : "var(--ink)" }}
            >
              {priority !== null ? `Score ${priority}` : "Unscored"} · {age}
            </strong>
          </div>
          {eventName && (
            <div className="triage-card__spec-row">
              <span className="t-meta">Active Event:</span>
              <span className="num" style={{ fontWeight: 600 }}>{eventName}</span>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 4,
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
          }}
        >
          {onOpenDetails ? (
            <button
              type="button"
              onClick={() => onOpenDetails(report)}
              className={`btn ${isPending && canReview ? "btn--primary" : ""}`}
              style={{ flex: 1 }}
            >
              <span>{ctaLabel}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <Link
              href={targetHref}
              className={`btn ${isPending && canReview ? "btn--primary" : ""}`}
              style={{ flex: 1 }}
            >
              <span>{ctaLabel}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          <ShareReportButton reportId={report.id} title={title} variant="quiet" size="md" />
        </div>
      </div>
    </article>
  );
}
