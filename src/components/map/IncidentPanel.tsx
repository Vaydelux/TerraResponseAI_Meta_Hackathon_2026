"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { INCIDENT_ACTION_CLASSES, INCIDENT_ICON_ACTION_CLASSES, IncidentEvidenceDetails } from "@/components/report/IncidentEvidenceDetails";
import { cn } from "@/lib/utils";
import { IncidentDetailsDialog, toEvidenceReport } from "./IncidentDetailsDialog";

export interface IncidentPanelData {
  id: string;
  status: string;
  review_outcome: string | null;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  location_label: string | null;
  location_source?: string;
  uploaded_at: string;
  priority_score: number | null;
  severity?: number | null;
  incidentType?: string | null;
  summary?: string | null;
  modelId?: string | null;
}

export interface IncidentPanelProps {
  report: IncidentPanelData;
  reviewerName?: string | null;
  canReview?: boolean;
  onClose?: () => void;
  className?: string;
}

export function IncidentPanel({ report, reviewerName, canReview = false, onClose, className }: IncidentPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <section className={cn("grid min-w-0 gap-4 rounded-panel border border-[var(--rule)] bg-sheet p-4 text-ink", className)} aria-label="Selected incident preview">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-base leading-snug font-semibold [overflow-wrap:anywhere]">Selected incident</h2>
          {onClose && <button type="button" onClick={onClose} aria-label="Close incident details" className={INCIDENT_ICON_ACTION_CLASSES}><X size={18} aria-hidden="true" /></button>}
        </div>
        <IncidentEvidenceDetails key={report.id} report={toEvidenceReport(report)} summary={report.summary} modelId={report.modelId} canReview={canReview} reviewerName={reviewerName} />
        <button type="button" onClick={() => setModalOpen(true)} className={INCIDENT_ACTION_CLASSES}><Maximize2 size={16} aria-hidden="true" />Expand incident details</button>
      </section>
      <IncidentDetailsDialog report={report} open={modalOpen} onOpenChange={setModalOpen} reviewerName={reviewerName} canReview={canReview} />
    </>
  );
}
