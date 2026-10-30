// src/components/review/ReviewQueueTable.tsx
//
// The reviewer queue table (the brief's "table with left-edge state
// stripe, thumbnail, incident type, severity segments, priority
// number, event, age. J/K moves selection, Enter opens the
// workbench").
//
// The table is a client component so J/K navigation works. The
// fetch respects the active event (the cookie is sent with same-
// origin requests). Each row links to /review/[id] — the
// workbench.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui-tr/Table";
import { SealBadge } from "@/components/seal/SealBadge";
import { SeverityMeter } from "@/components/report/SeverityMeter";
import { ReportThumb } from "@/components/report/ReportThumb";
import { SkeletonRow, EmptyState, Button } from "@/components/ui-tr";
import { COPY } from "@/lib/design/copy";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { cn } from "@/lib/utils";

export interface ReviewQueueRow {
  id: string;
  status: string;
  review_outcome: string | null;
  title: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: string;
  location_label: string | null;
  uploaded_at: string;
  priority_score: number | null;
  report_analyses?: Array<{ structured_observation: { incident_type?: string; preliminary_severity?: number } }> | null;
}

export interface ReviewQueueTableProps {
  eventId: string;
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

export function ReviewQueueTable({ eventId, className }: ReviewQueueTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    const ctrl = new AbortController();
    const load = async (status: "needs_review" | "needs_manual_review"): Promise<ReviewQueueRow[]> => {
      const params = new URLSearchParams({
        event_id: eventId, status, limit: "50", include_analysis: "true",
      });
      const response = await fetch(`/api/reports?${params.toString()}`, { signal: ctrl.signal });
      if (!response.ok) throw new Error("Review queue could not be loaded.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("ok" in body) ||
          (body as { ok?: unknown }).ok !== true || !("reports" in body) ||
          !Array.isArray((body as { reports?: unknown }).reports)) {
        throw new Error("Review queue returned an invalid response.");
      }
      return (body as { reports: ReviewQueueRow[] }).reports;
    };
    queueMicrotask(() => {
      if (!ctrl.signal.aborted) {
        setRows(null);
        setError(null);
      }
    });
    Promise.all([load("needs_review"), load("needs_manual_review")])
      .then(([pending, manual]) => {
        if (ctrl.signal.aborted) return;
        // Duplicate IDs should never appear twice, even if an API returns
        // overlapping states during concurrent state transitions.
        const unique = new Map([...pending, ...manual].map((row) => [row.id, row]));
        const all = [...unique.values()].sort((a, b) =>
          (b.priority_score ?? 0) - (a.priority_score ?? 0));
        setRows(all);
        setActiveIdx(0);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("[review-queue] Failed to load event review queue", err instanceof Error ? err.message : "unknown");
        setError("The review queue could not be loaded. Your reports have not been changed.");
        setRows(null);
      });
    return () => ctrl.abort();
  }, [eventId, retryCount]);

  // J/K are optional convenience shortcuts. Leave Enter/Space and
  // interactive elements to the browser so buttons and links work
  // normally for keyboard and assistive-technology users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!rows?.length || e.defaultPrevented || e.repeat ||
          e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof Element &&
          (target.closest("input, textarea, select, button, a, [role='dialog'], [contenteditable='true']") ||
           (target instanceof HTMLElement && target.isContentEditable))) return;
      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows]);

  if (error) {
    return <EmptyState title="Could not load the queue" description={error}
      action={<Button variant="primary" onClick={() => setRetryCount((n) => n + 1)}>Retry loading queue</Button>} />;
  }

  if (rows === null) {
    return (
      <div className={cn(className)} aria-busy="true" aria-label="Loading queue">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No reports waiting"
        description={COPY.emptyReviewQueue}
      />
    );
  }

  return (
    <Table className={className}>
      <THead>
        <TR>
          <TH>Photo</TH>
          <TH>Incident</TH>
          <TH>Seal</TH>
          <TH>Severity</TH>
          <TH>Priority</TH>
          <TH>Uploaded</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => {
          const obs = r.report_analyses?.[0]?.structured_observation ?? {};
          const incidentType = (obs.incident_type as string) ?? null;
          const severity = (obs.preliminary_severity as number) ?? null;
          const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
          const title = incidentType ? INCIDENT_LABEL[incidentType] ?? incidentType : r.title || `Report ${r.id.slice(0, 8)}`;
          return (
            <TR
              key={r.id}
              state={state === "pending" ? "pending" : state === "failed" ? "pending" : "confirmed"}
              selected={i === activeIdx}
              onClick={() => router.push(`/review/${r.id}`)}
              style={{ cursor: "pointer" }}
            >
              <TD>
                <ReportThumb reportId={r.id} state={state} alt={title} />
              </TD>
              <TD>
                <Link href={`/review/${r.id}`} style={{ color: "var(--ink)", fontWeight: 700 }}>
                  {title}
                </Link>
                {r.description && <div className="t-meta" style={{ marginTop: 4 }}>{r.description}</div>}
              </TD>
              <TD>
                <SealBadge state={state} />
              </TD>
              <TD>
                <SeverityMeter level={toSeverityLevel(severity)} state={state} compact />
              </TD>
              <TD className="num" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--step-1)" }}>
                {r.priority_score ?? "—"}
              </TD>
              <TD className="t-meta">{formatRelativeTime(r.uploaded_at)}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
