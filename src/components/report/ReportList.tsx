// src/components/report/ReportList.tsx
//
// The reports list — a `.tr-stack` of ReportRow components. Handles
// the three designed states (skeleton during load, empty, error).
// When the list is large (>50), the stack wraps in a max-h-96 scroll
// with the custom scrollbar styling (per the UI rules).
//
// The list is a client component so it can fetch the reports from
// `/api/reports?event_id=<id>`. The fetch respects the active event
// (the cookie set by EventSwitcher is sent automatically with same-
// origin requests).
//
// Per the brief: "Includes the three designed states: skeleton
// (during load), empty (EmptyState with COPY.emptyReviewQueue),
// error."

"use client";

import { useEffect, useState } from "react";
import { ReportRow, type ReportRowData } from "./ReportRow";
import { SkeletonRow } from "@/components/ui-tr/Skeleton";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { COPY } from "@/lib/design/copy";
import { cn } from "@/lib/utils";

export interface ReportListProps {
  /** The event id to filter by. */
  eventId: string;
  /** Optional status filter (e.g. "needs_review" for the review queue). */
  status?: string;
  /** Optional: only show unlocated reports. */
  unlocated?: boolean;
  /** Optional: include_analysis=true so the AI's incident_type is included. */
  includeAnalysis?: boolean;
  /** Limit; default 50, max 200. */
  limit?: number;
  /** Caption for the empty state (defaults to COPY.emptyReviewQueue). */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

interface ReportListResponse {
  ok?: boolean;
  reports?: ReportRowData[];
  error?: { code?: string; message?: string };
}

export function ReportList({
  eventId,
  status,
  unlocated,
  includeAnalysis = true,
  limit = 50,
  emptyTitle,
  emptyDescription,
  className,
}: ReportListProps) {
  const [reports, setReports] = useState<ReportRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ event_id: eventId, limit: String(limit) });
    if (status) params.set("status", status);
    if (unlocated) params.set("unlocated", "true");
    if (includeAnalysis) params.set("include_analysis", "true");

    fetch(`/api/reports?${params}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<ReportListResponse>)
      .then((body) => {
        if (body?.ok && Array.isArray(body.reports)) {
          setReports(body.reports);
          setError(null);
        } else if (body?.error) {
          setError(body.error.message ?? "Could not load reports.");
          setReports([]);
        } else {
          setError("Unexpected response.");
          setReports([]);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setError("Network error.");
          setReports([]);
        }
      });
    return () => ctrl.abort();
  }, [eventId, status, unlocated, includeAnalysis, limit]);

  if (error) {
    return (
      <EmptyState
        title="Could not load reports"
        description={error}
      />
    );
  }

  if (reports === null) {
    return (
      <div className={cn("tr-stack", className)} aria-busy="true" aria-label="Loading reports">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "No reports yet"}
        description={emptyDescription ?? COPY.emptyReviewQueue}
      />
    );
  }

  return (
    <div className={cn("tr-stack", className)}>
      {reports.map((r) => (
        <ReportRow key={r.id} report={r} />
      ))}
    </div>
  );
}
