"use client";

import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INCIDENT_ICON_ACTION_CLASSES, IncidentEvidenceDetails } from "./IncidentEvidenceDetails";
import type { ReportAuditEntry, ReportRowData } from "./ReportRow";

export interface DetailsModalProps {
  report: ReportRowData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canReview?: boolean;
  reviewerName?: string | null;
  auditTrail?: ReportAuditEntry[];
  /** Optional actual analysis summary supplied by the map report loader. */
  summary?: string | null;
  modelId?: string | null;
}

export function DetailsModal({ report, open, onOpenChange, canReview = false, reviewerName, auditTrail, summary, modelId }: DetailsModalProps) {
  if (!report) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] min-w-0 max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overscroll-contain border-[var(--rule)] bg-sheet p-0 text-ink sm:max-w-2xl">
        <DialogHeader className="min-w-0 border-b border-[var(--rule)] p-4 text-left sm:p-6">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="grid min-w-0 gap-1">
              <DialogTitle className="break-words text-[length:var(--step-2)] leading-snug [overflow-wrap:anywhere]">Incident details</DialogTitle>
              <DialogDescription className="break-words text-sm leading-relaxed text-[var(--ink-2)] [overflow-wrap:anywhere]">Submitted evidence, available observations, and recorded review status.</DialogDescription>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className={INCIDENT_ICON_ACTION_CLASSES} aria-label="Close incident details">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>
        <div className="min-w-0 p-4 sm:p-6">
          <IncidentEvidenceDetails key={report.id} report={report} canReview={canReview} reviewerName={reviewerName} auditTrail={auditTrail} summary={summary} modelId={modelId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
