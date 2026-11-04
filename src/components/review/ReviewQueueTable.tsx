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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
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
import { rankQueue, triageLabel, type TriageQueueClass } from "@/lib/triage/queue-priority";

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
  report_triage?: { triage_class?: TriageQueueClass; preliminary_severity?: number | null; verification_status?: string } | null;
  report_analyses?: Array<{ structured_observation: { incident_type?: string; preliminary_severity?: number } }> | null;
}

export interface ReviewQueueTableProps {
  eventId?: string;
  statusFilter?: string;
  severityFilter?: string;
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

export function ReviewQueueTable({
  eventId,
  statusFilter = "",
  severityFilter = "",
  className,
}: ReviewQueueTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async (status: "needs_review" | "needs_manual_review"): Promise<ReviewQueueRow[]> => {
      const params = new URLSearchParams({
        status, limit: "50", include_analysis: "true", include_triage: "true",
      });
      if (eventId) params.set("event_id", eventId);
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
        const unique = new Map([...pending, ...manual].map((row) => [row.id, row]));
        const all = rankQueue([...unique.values()]);
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

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      const analysisEntry = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
      const obs = (analysisEntry as { structured_observation?: { incident_type?: string; preliminary_severity?: number } } | undefined)?.structured_observation ?? {};
      const sev = (obs.preliminary_severity as number | undefined) ?? r.report_triage?.preliminary_severity ?? null;
      if (severityFilter) {
        const target = Number(severityFilter);
        if (Number.isFinite(target) && (sev ?? 0) !== target) return false;
      }
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = [
          r.id,
          r.title,
          r.description,
          obs.incident_type,
          r.location_label,
          triageLabel(r),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, severityFilter, query]);

  const kpis = useMemo(() => {
    const all = rows ?? [];
    const total = all.length;
    const highPriority = all.filter((r) => (r.priority_score ?? 0) >= 75).length;
    const criticalSev = all.filter((r) => {
      const analysisEntry = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
      const obs = (analysisEntry as { structured_observation?: { incident_type?: string; preliminary_severity?: number } } | undefined)?.structured_observation ?? {};
      const sev = (obs.preliminary_severity as number | undefined) ?? r.report_triage?.preliminary_severity ?? 0;
      return sev >= 4;
    }).length;
    const manualCount = all.filter((r) => r.status === "needs_manual_review").length;
    return { total, highPriority, criticalSev, manualCount };
  }, [rows]);

  // J/K are optional convenience shortcuts. Leave Enter/Space and
  // interactive elements to the browser so buttons and links work
  // normally for keyboard and assistive-technology users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The letter shortcuts are desktop-only; never intercept typing or touch layouts.
      if (typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 1024px)").matches) return;
      if (!filteredRows?.length || e.defaultPrevented || e.repeat ||
          e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof Element &&
          (target.closest("input, textarea, select, button, a, [role='dialog'], [contenteditable='true']") ||
           (target instanceof HTMLElement && target.isContentEditable))) return;
      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filteredRows.length - 1));
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredRows]);

  if (error) {
    return (
      <EmptyState
        title="Could not load the queue"
        description={error}
        action={
          <Button variant="primary" onClick={() => setRetryCount((n) => n + 1)}>
            Retry loading queue
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn("tr-stack", className)} style={{ display: "grid", gap: "var(--s-4)" }}>
      {/* Reviewer Queue KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Queue Depth</span>
          </div>
          <div className="kpi-card__value num">{rows === null ? "—" : kpis.total}</div>
          <div className="kpi-card__sub">Reports awaiting human sign-off</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">High Priority (≥75)</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--brick-ink)" }}>
            {rows === null ? "—" : kpis.highPriority}
          </div>
          <div className="kpi-card__sub">Ranked first in moderation queue</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Critical Severity (4–5)</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--amber-ink)" }}>
            {rows === null ? "—" : kpis.criticalSev}
          </div>
          <div className="kpi-card__sub">Meta AI preliminary severity ≥ 4</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Manual Triage Needed</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {rows === null ? "—" : kpis.manualCount}
          </div>
          <div className="kpi-card__sub">Low-information or unlocated photos</div>
        </div>
      </div>

      {/* Search & Keyboard Legend Bar */}
      <div
        className="panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s-3)",
          flexWrap: "wrap",
          padding: "12px 16px",
        }}
      >
        <div className="feed-search" style={{ flex: "1 1 260px", margin: 0 }}>
          <Search size={16} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search queue by title, hazard type, location, or report ID…"
            aria-label="Search review queue"
          />
        </div>
        <span className="t-meta num">
          Tip: Press <strong>J</strong> / <strong>K</strong> to move selection · Click any row to open Workbench
        </span>
      </div>

      {filteredRows === null ? (
        <div aria-busy="true" aria-label="Loading queue" className="tr-stack">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="No reports waiting"
          description={
            rows && rows.length > 0
              ? "No reports in the queue match your active filters."
              : COPY.emptyReviewQueue
          }
        />
      ) : (
        <>
          <div className="grid min-w-0 gap-3 lg:hidden" aria-label="Review queue mobile report cards" data-testid="mobile-review-cards">
            {filteredRows.map((r) => {
              const analysis = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
              const obs = (analysis as { structured_observation?: { incident_type?: string; preliminary_severity?: number } } | undefined)?.structured_observation;
              const type = obs?.incident_type ?? null;
              const title = type ? (INCIDENT_LABEL[type] ?? type) : r.title || `Report ${r.id.slice(0, 8)}`;
              const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
              const severity = obs?.preliminary_severity ?? r.report_triage?.preliminary_severity ?? null;
              return <article key={r.id} className="grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-4" data-testid={`mobile-review-${r.id}`}>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="m-0 break-words text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Awaiting human assessment</p>
                    <h3 className="m-0 break-words text-base font-bold text-ink [overflow-wrap:anywhere]">{title}</h3>
                    {r.description && <p className="m-0 line-clamp-3 break-words text-sm text-[var(--ink-2)] [overflow-wrap:anywhere]">{r.description}</p>}
                  </div>
                  <SealBadge state={state} />
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <div className="rounded-ctl border border-rule bg-[var(--sheet-sunk)] p-3">
                    <p className="m-0 text-xs font-semibold text-[var(--ink-3)]">AI triage · provisional</p>
                    <p className="m-0 mt-1 break-words text-sm text-ink">{triageLabel(r)}</p>
                  </div>
                  <div className="rounded-ctl border border-rule bg-[var(--sheet-sunk)] p-3">
                    <p className="m-0 text-xs font-semibold text-[var(--ink-3)]">Priority · loaded queue</p>
                    <p className="m-0 mt-1 text-sm font-semibold tabular-nums text-ink">{r.priority_score ?? "Unavailable"}</p>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[var(--ink-2)]">{formatRelativeTime(r.uploaded_at)}</span>
                  <div className="flex items-center gap-2"><span className="text-xs text-[var(--ink-3)]">Severity</span><SeverityMeter level={toSeverityLevel(severity)} state={state} compact /></div>
                </div>
                <Link href={`/review/${r.id}`} aria-label={`Review ${title}`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-ctl border border-[var(--tide)] bg-[var(--tide)] px-4 text-center text-sm font-semibold text-[var(--on-tide)] transition-colors hover:bg-[var(--tide-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-press)] motion-reduce:transition-none">
                  Open review workbench
                </Link>
              </article>;
            })}
          </div>
          <div className="hidden min-w-0 overflow-x-auto lg:block" data-testid="desktop-review-table">
            <Table>
              <THead>
            <TR>
              <TH>Photo</TH>
              <TH>Incident</TH>
              <TH>Seal</TH>
              <TH>AI triage</TH>
              <TH>Severity</TH>
              <TH>Priority</TH>
              <TH>Uploaded</TH>
            </TR>
          </THead>
          <TBody>
            {filteredRows.map((r, i) => {
              const analysisEntry = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
      const obs = (analysisEntry as { structured_observation?: { incident_type?: string; preliminary_severity?: number } } | undefined)?.structured_observation ?? {};
              const incidentType = (obs.incident_type as string) ?? null;
              const severity = (obs.preliminary_severity as number) ?? null;
              const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
              const title = incidentType
                ? INCIDENT_LABEL[incidentType] ?? incidentType
                : r.title || `Report ${r.id.slice(0, 8)}`;
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
                    {r.description && (
                      <div className="t-meta" style={{ marginTop: 4 }}>
                        {r.description}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <SealBadge state={state} />
                  </TD>
                  <TD className="t-meta">{triageLabel(r)}</TD>
                  <TD>
                    <SeverityMeter level={toSeverityLevel(severity)} state={state} compact />
                  </TD>
                  <TD
                    className="num"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "var(--step-1)",
                    }}
                  >
                    {r.priority_score ?? "—"}
                  </TD>
                  <TD className="t-meta">{formatRelativeTime(r.uploaded_at)}</TD>
                </TR>
              );
            })}
          </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
