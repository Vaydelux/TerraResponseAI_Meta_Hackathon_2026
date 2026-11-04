"use client";

import { MapPin, MapPinOff, Pin, PinOff } from "lucide-react";
import { formatRelativeTime } from "@/lib/design/format";
import { stateFromReport } from "@/lib/design/status";
import { hasMapLocation, reportTitle, type WorkspaceReport } from "@/lib/workspace/incidents";
import { workspaceAction } from "@/lib/workspace/presentation";

export interface IncidentQueueProps {
  reports: WorkspaceReport[]; selectedId: string | null; pinnedIds: ReadonlySet<string>;
  onSelect: (id: string) => void; onTogglePin: (id: string) => void;
  outsideFilterIds?: ReadonlySet<string>; pinned?: boolean;
}

export function IncidentQueue({ reports, selectedId, pinnedIds, onSelect, onTogglePin, outsideFilterIds, pinned = false }: IncidentQueueProps) {
  return <ul className={pinned ? "flex min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 min-[1440px]:grid min-[1440px]:overflow-visible" : "grid min-w-0 gap-3"}>
    {reports.map((report) => {
      const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
      const isPinned = pinnedIds.has(report.id); const located = hasMapLocation(report);
      const LocationIcon = located ? MapPin : MapPinOff; const PinIcon = isPinned ? PinOff : Pin;
      // An uploaded or manual-review report does not necessarily have a
      // saved AI observation. Keep the queue labels grounded in real data.
      const statusLabel =
        report.status === "needs_manual_review" && !report.model_id ? "Human review pending · no AI finding" :
        state === "confirmed" ? "Human confirmed" :
        state === "failed" ? "Analysis unavailable" :
        state === "rejected" ? "Rejected" :
        state === "flagged" ? "Flagged for review" :
        report.status === "uploaded" ? "Awaiting AI analysis" :
        report.status === "analyzing" ? "AI analysis in progress" :
        report.model_id ? "AI observation · not verified" :
        "Human review pending · no AI finding";
      return <li key={report.id} className={`grid min-w-0 gap-2 rounded-panel border bg-sheet p-3 ${selectedId === report.id ? "border-[var(--tide)] ring-1 ring-tide" : "border-rule"} ${pinned ? "w-[min(280px,85vw)] shrink-0 snap-start min-[1440px]:w-auto" : ""}`}>
        <button type="button" aria-pressed={selectedId === report.id} onClick={() => onSelect(report.id)} className="grid min-h-11 min-w-0 gap-2 rounded-ctl p-1 text-left text-ink transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none" aria-label={`Select ${reportTitle(report)}`}>
          <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-2)]"><span className="font-mono">#{report.id.slice(0, 8)}</span><span>Priority {report.priority_score ?? "unscored"}</span></span>
          <strong className="break-words text-sm leading-snug [overflow-wrap:anywhere]">{reportTitle(report)}</strong>
          <span className="flex min-w-0 items-start gap-2 text-xs text-[var(--ink-2)]"><LocationIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="break-words [overflow-wrap:anywhere]">{located ? report.location_label || "Coordinates provided" : "Location unknown · not on map"}</span></span>
          <span className={`text-xs font-semibold ${state === "confirmed" ? "text-[var(--green-ink)]" : state === "failed" ? "text-[var(--ink-3)]" : "text-[var(--amber-ink)]"}`}>{statusLabel}</span>
          <span className="text-xs text-[var(--ink-3)]">Reported {formatRelativeTime(report.uploaded_at) || "time unavailable"}</span>
          {outsideFilterIds?.has(report.id) && <span className="text-xs font-semibold text-[var(--tide)]">Outside current filters · select to show</span>}
        </button>
        <button type="button" aria-pressed={isPinned} onClick={() => onTogglePin(report.id)} className={`${workspaceAction} w-full`} aria-label={`${isPinned ? "Unpin" : "Pin"} ${reportTitle(report)}`}><PinIcon size={15} aria-hidden="true" />{isPinned ? "Unpin report" : "Pin report"}</button>
      </li>;
    })}
  </ul>;
}
