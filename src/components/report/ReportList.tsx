// src/components/report/ReportList.tsx
//
// The reports list — supports both compact List View (ReportRow) and
// visual Grid View (ReportCard), live search + URL filter params from
// FilterRail, and a Command Hub KPI summary strip.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, LayoutGrid, List as ListIcon } from "lucide-react";
import { ReportRow, type ReportRowData } from "./ReportRow";
import { ReportCard } from "./ReportCard";
import { FilterRail } from "@/components/layout/FilterRail";
import { SkeletonRow } from "@/components/ui-tr/Skeleton";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { COPY } from "@/lib/design/copy";
import { cn } from "@/lib/utils";

export interface ReportListProps {
  /** The event id to filter by. */
  eventId?: string;
  /** Optional status filter (e.g. "needs_review" for the review queue). */
  status?: string;
  /** Optional: only show unlocated reports. */
  unlocated?: boolean;
  /** Optional: include_analysis=true so the AI's incident_type is included. */
  includeAnalysis?: boolean;
  /** Limit; default 50, max 200. */
  limit?: number;
  /** Optional current user id to support 'Mine only' filter. */
  currentUserId?: string;
  /** Whether to show the Command Hub KPI summary strip and FilterRail (default true when not embedded). */
  showControls?: boolean;
  /** Caption for the empty state (defaults to COPY.emptyReviewQueue). */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

interface ExtendedReportRowData extends ReportRowData {
  creator_id?: string;
  report_analyses?: Array<{
    structured_observation?: {
      incident_type?: string;
      preliminary_severity?: number;
    };
  }> | null;
}

interface ReportListResponse {
  ok?: boolean;
  reports?: ExtendedReportRowData[];
  error?: { code?: string; message?: string };
}

export function ReportList({
  eventId,
  status,
  unlocated,
  includeAnalysis = true,
  limit = 50,
  currentUserId,
  showControls = true,
  emptyTitle,
  emptyDescription,
  className,
}: ReportListProps) {
  const searchParams = useSearchParams();
  const urlStatus = searchParams?.get("status") ?? "";
  const urlSeverity = searchParams?.get("severity") ?? "";
  const urlMine = searchParams?.get("mine") ?? "";

  const [reports, setReports] = useState<ExtendedReportRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const effectiveStatus = status || urlStatus || undefined;

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ limit: String(limit) });
    if (eventId) params.set("event_id", eventId);
    if (effectiveStatus) params.set("status", effectiveStatus);
    if (unlocated) params.set("unlocated", "true");
    if (includeAnalysis) params.set("include_analysis", "true");

    fetch(`/api/reports?${params}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<ReportListResponse>)
      .then((body) => {
        if (body?.ok && Array.isArray(body.reports)) {
          const normalized = body.reports.map((r) => {
            const analysisEntry = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
            const obs = (analysisEntry as { structured_observation?: { incident_type?: string; preliminary_severity?: number } } | undefined)?.structured_observation;
            return {
              ...r,
              incident_type: r.incident_type ?? obs?.incident_type ?? null,
              severity: r.severity ?? obs?.preliminary_severity ?? null,
            };
          });
          setReports(normalized);
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
  }, [eventId, effectiveStatus, unlocated, includeAnalysis, limit]);

  const kpis = useMemo(() => {
    const all = reports ?? [];
    const total = all.length;
    const pending = all.filter(
      (r) => r.status === "needs_review" || r.status === "needs_manual_review" || r.status === "analyzing",
    ).length;
    const confirmed = all.filter(
      (r) => r.status === "reviewed" && r.review_outcome === "confirmed",
    ).length;
    const critical = all.filter((r) => (r.severity ?? 0) >= 4).length;
    return { total, pending, confirmed, critical };
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!reports) return null;
    return reports.filter((r) => {
      if (urlSeverity) {
        const targetSev = Number(urlSeverity);
        if (Number.isFinite(targetSev) && (r.severity ?? 0) !== targetSev) {
          return false;
        }
      }
      if (urlMine === "1" && currentUserId && r.creator_id && r.creator_id !== currentUserId) {
        return false;
      }
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = [
          r.id,
          r.title,
          r.description,
          r.incident_type,
          r.location_label,
          r.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, urlSeverity, urlMine, currentUserId, query]);

  if (error) {
    return (
      <EmptyState
        title="Could not load reports"
        description={error}
      />
    );
  }

  return (
    <div className={cn("tr-stack", className)} style={{ display: "grid", gap: "var(--s-4)" }}>
      {showControls && (
        <>
          {/* Command Hub KPI Strip */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card__head">
                <span className="kpi-card__label">Total Submissions</span>
              </div>
              <div className="kpi-card__value num">{reports === null ? "—" : kpis.total}</div>
              <div className="kpi-card__sub">RLS-authorized field evidence</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card__head">
                <span className="kpi-card__label">Awaiting Review</span>
              </div>
              <div className="kpi-card__value num" style={{ color: "var(--amber-ink)" }}>
                {reports === null ? "—" : kpis.pending}
              </div>
              <div className="kpi-card__sub">Pending human moderator sign-off</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card__head">
                <span className="kpi-card__label">Confirmed Findings</span>
              </div>
              <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
                {reports === null ? "—" : kpis.confirmed}
              </div>
              <div className="kpi-card__sub">Human-verified incident reports</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card__head">
                <span className="kpi-card__label">High / Critical (Sev 4–5)</span>
              </div>
              <div className="kpi-card__value num" style={{ color: "var(--brick-ink)" }}>
                {reports === null ? "—" : kpis.critical}
              </div>
              <div className="kpi-card__sub">Elevated hazard severity score</div>
            </div>
          </div>

          {/* FilterRail + Search & View Switcher */}
          <FilterRail showMine={Boolean(currentUserId)}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--s-3)",
                flexWrap: "wrap",
                marginTop: "var(--s-3)",
                paddingTop: "var(--s-3)",
                borderTop: "1px solid var(--rule)",
              }}
            >
              <div className="feed-search" style={{ flex: "1 1 260px", margin: 0 }}>
                <Search size={16} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by report ID, title, location, or hazard type…"
                  aria-label="Search reports"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="t-meta num">
                  Showing {filteredReports?.length ?? 0} of {reports?.length ?? 0}
                </span>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Report view layout"
                >
                  <button
                    type="button"
                    className="segmented__opt"
                    aria-pressed={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                    data-testid="reports-view-list"
                  >
                    <ListIcon size={14} aria-hidden="true" />
                    <span style={{ marginLeft: 4 }}>List</span>
                  </button>
                  <button
                    type="button"
                    className="segmented__opt"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => setViewMode("grid")}
                    data-testid="reports-view-grid"
                  >
                    <LayoutGrid size={14} aria-hidden="true" />
                    <span style={{ marginLeft: 4 }}>Cards</span>
                  </button>
                </div>
              </div>
            </div>
          </FilterRail>
        </>
      )}

      {filteredReports === null ? (
        <div className="tr-stack" aria-busy="true" aria-label="Loading reports">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "No matching reports"}
          description={
            reports && reports.length > 0
              ? "No reports match the active status, severity, or search filters."
              : emptyDescription ?? COPY.emptyReviewQueue
          }
        />
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: "var(--s-4)",
          }}
          data-testid="report-card-grid"
        >
          {filteredReports.map((r) => (
            <ReportCard key={r.id} report={r} eventName={r.event_name} />
          ))}
        </div>
      ) : (
        <div className="tr-stack" data-testid="report-row-list">
          {filteredReports.map((r) => (
            <ReportRow key={r.id} report={r} eventName={r.event_name} />
          ))}
        </div>
      )}
    </div>
  );
}
