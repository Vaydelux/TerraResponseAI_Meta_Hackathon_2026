"use client";

import { DetailsModal } from "@/components/report/DetailsModal";
import type { ReportRowData } from "@/components/report/ReportRow";
import type { IncidentPanelData } from "./IncidentPanel";

export interface IncidentDetailsDialogProps {
  report: IncidentPanelData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewerName?: string | null;
  canReview?: boolean;
}

/** Adapt actual map fields without supplying observations or metrics. */
export function toEvidenceReport(report: IncidentPanelData): ReportRowData {
  return {
    id: report.id,
    status: report.status,
    review_outcome: report.review_outcome,
    title: report.title,
    description: report.description,
    latitude: report.latitude,
    longitude: report.longitude,
    location_label: report.location_label,
    location_source: report.location_source,
    uploaded_at: report.uploaded_at,
    priority_score: report.priority_score,
    severity: report.severity,
    incident_type: report.incidentType,
  };
}

export function IncidentDetailsDialog({ report, open, onOpenChange, reviewerName, canReview = false }: IncidentDetailsDialogProps) {
  return <DetailsModal report={report ? toEvidenceReport(report) : null} open={open} onOpenChange={onOpenChange} reviewerName={reviewerName} canReview={canReview} summary={report?.summary} modelId={report?.modelId} />;
}
