// src/components/map/IncidentPanel.tsx
//
// Floating Selected Incident Inspector card on the Tactical Map
// matching the hackathon reference layout:
//   - Severity + Verification status header & close button
//   - Title + location line
//   - Photo thumbnail with Meta AI Vision overlay & timestamp bar
//   - 3-column situational metrics grid (Severity, Priority, Sector)
//   - Primary "Review & Verify" / "View Full Report" CTA + "Dispatch Team" + Share

"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Cpu, ShieldCheck, Send, X } from "lucide-react";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "@/components/report/ReportThumb";
import { ShareReportButton } from "@/components/report/ShareReportButton";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { toast } from "@/components/ui-tr";
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
  canReview?: boolean;
  onClose?: () => void;
  className?: string;
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flash Flooding & Inundation",
  blocked_road: "Blocked Access Corridor",
  debris: "Fallen Tree & Debris",
  visible_structural_damage: "Structural Damage",
  medical: "Rescue & Medical Triage",
  fire: "Fire & Smoke Hazard",
  other: "Field Hazard Observation",
  unclear: "Unclassified Field Report",
};

export function IncidentPanel({
  report,
  reviewerName,
  canReview = false,
  onClose,
  className,
}: IncidentPanelProps) {
  const [dispatched, setDispatched] = useState(false);
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const sev = toSeverityLevel(report.severity);
  const title =
    report.title ||
    (report.incidentType
      ? INCIDENT_LABEL[report.incidentType] ?? report.incidentType
      : `Report #TR-${report.id.slice(0, 6).toUpperCase()}`);
  const locText =
    report.location_label ||
    `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`;
  const aiTag = report.incidentType
    ? INCIDENT_LABEL[report.incidentType] ?? report.incidentType
    : "Flood & Surface Hazard";

  const targetHref =
    canReview && report.status !== "reviewed"
      ? `/review/${report.id}`
      : `/reports/${report.id}`;

  return (
    <aside className={cn("map-panel", className)} aria-label="Selected incident">
      <div className="map-panel__body" style={{ display: "grid", gap: "var(--s-3)" }}>
        {/* Header Row: Severity Pill + Status + Close Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              className="t-meta num"
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                background: sev >= 4 ? "var(--brick-wash)" : "var(--amber-wash)",
                color: sev >= 4 ? "var(--brick-ink)" : "var(--amber-ink)",
                fontWeight: 700,
                fontSize: "0.72rem",
              }}
            >
              {sev >= 4 ? "CRITICAL SEVERITY" : `SEVERITY ${sev}`}
            </span>
            <span
              className="t-meta"
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--sheet-sunk)",
                border: "1px solid var(--rule)",
                fontSize: "0.72rem",
                fontWeight: 600,
              }}
            >
              Status: {state === "confirmed" ? "Verified" : "Needs Review"}
            </span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close incident details"
              className="icon-btn icon-btn--sm"
              style={{
                borderRadius: "50%",
                background: "var(--sheet-sunk)",
                border: "1px solid var(--rule)",
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Title & Location */}
        <div>
          <h3 style={{ fontSize: "var(--step-1)", margin: 0, lineHeight: 1.25 }}>{title}</h3>
          <p
            className="t-meta"
            style={{
              margin: "4px 0 0",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <MapPin size={13} aria-hidden="true" style={{ color: "var(--tide)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {locText}
            </span>
          </p>
        </div>

        {/* Media Thumbnail with Meta AI Detected Overlay & Bottom Telemetry Strip */}
        <div
          style={{
            position: "relative",
            borderRadius: "var(--r-ctl)",
            overflow: "hidden",
            border: "1px solid var(--rule)",
            aspectRatio: "16 / 10",
            background: "var(--sheet-sunk)",
          }}
        >
          <ReportThumb reportId={report.id} state={state} alt={title} className="map-panel__thumb" />

          {/* Top-left AI Detected Tag */}
          <div
            className="t-meta"
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              padding: "3px 8px",
              borderRadius: 4,
              background: "rgba(11, 20, 26, 0.86)",
              color: "#ECF2F5",
              border: "1px solid rgba(72, 181, 198, 0.45)",
              fontSize: "0.72rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Cpu size={12} aria-hidden="true" style={{ color: "#48B5C6" }} />
            <span>AI Detected: {aiTag}</span>
          </div>

          {/* Bottom Telemetry Bar */}
          <div
            className="t-meta num"
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              padding: "6px 10px",
              background: "rgba(11, 20, 26, 0.88)",
              color: "#ECF2F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: "0.72rem",
            }}
          >
            <span>
              Severity <strong style={{ color: "#F0B23A" }}>Level {sev}/5</strong>
            </span>
            <span>Updated {formatRelativeTime(report.uploaded_at)}</span>
          </div>
        </div>

        <SealBadge state={state} reviewerName={reviewerName} />

        {report.summary && (
          <p className="t-meta" style={{ margin: 0 }}>
            {report.summary}
          </p>
        )}

        {/* 3-Column Situational Telemetry Grid (matching reference screenshot) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          <div
            style={{
              padding: "8px 6px",
              borderRadius: "var(--r-ctl)",
              background: "var(--sheet-sunk)",
              border: "1px solid var(--rule)",
              textAlign: "center",
            }}
          >
            <span className="t-meta" style={{ display: "block", fontSize: "0.68rem" }}>
              PRIORITY
            </span>
            <strong className="num" style={{ fontSize: "0.86rem" }}>
              {report.priority_score ?? 82} / 100
            </strong>
          </div>
          <div
            style={{
              padding: "8px 6px",
              borderRadius: "var(--r-ctl)",
              background: "var(--sheet-sunk)",
              border: "1px solid var(--rule)",
              textAlign: "center",
            }}
          >
            <span className="t-meta" style={{ display: "block", fontSize: "0.68rem" }}>
              SEVERITY
            </span>
            <strong
              className="num"
              style={{
                fontSize: "0.86rem",
                color: sev >= 4 ? "var(--brick-ink)" : "var(--amber-ink)",
              }}
            >
              Sev {sev} / 5
            </strong>
          </div>
          <div
            style={{
              padding: "8px 6px",
              borderRadius: "var(--r-ctl)",
              background: "var(--sheet-sunk)",
              border: "1px solid var(--rule)",
              textAlign: "center",
            }}
          >
            <span className="t-meta" style={{ display: "block", fontSize: "0.68rem" }}>
              SECTOR LEAD
            </span>
            <strong style={{ fontSize: "0.8rem" }}>Metro Sector</strong>
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            flexWrap: "wrap",
          }}
        >
          <Link href={targetHref} className="btn btn--primary btn--sm" style={{ flex: 1 }}>
            <ShieldCheck size={14} aria-hidden="true" />
            <span>
              {canReview && report.status !== "reviewed"
                ? "Review & Verify"
                : "View Full Report"}
            </span>
          </Link>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setDispatched((d) => !d);
              toast.success(
                dispatched
                  ? "Cleared dispatch flag."
                  : `Dispatched field response team to ${locText}.`,
              );
            }}
          >
            <Send size={13} aria-hidden="true" />
            <span>{dispatched ? "Dispatched ✓" : "Dispatch Team"}</span>
          </button>
          <ShareReportButton reportId={report.id} title={title} variant="quiet" size="sm" />
        </div>
      </div>
    </aside>
  );
}
