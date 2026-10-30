// src/components/review/ReviewWorkbench.tsx
//
// The main review screen. Composes EvidenceViewer (left) +
// ObservationPanel (right, with the ReviewActionBar). On mobile
// (≤1099px), the CSS flips to a single column with the action bar
// fixed to the viewport bottom.
//
// Per docs/DESIGN.md §6, the workbench is the keystone screen: the
// reviewer sees the photo first (larger, on top on mobile), the AI
// observation second (with the amber-hatched Seal), and the four
// review verbs at the bottom.
//
// The component is a client component because it manages the
// resolving state (drives the Seal's resolve animation) + the queue
// position (prefetches the next item). It fetches the report + the
// analysis + the priority breakdown on mount.
//
// For the read-only report detail page (no action bar), pass
// `readOnly={true}` — the ObservationPanel renders without the
// ReviewActionBar.

"use client";

import { useEffect, useState } from "react";
import { EvidenceViewer } from "./EvidenceViewer";
import { type SamOverlay } from "./MaskControl";
import { ObservationPanel, type ObservationData } from "./ObservationPanel";
import { ReviewActionBar } from "./ReviewActionBar";
import { WeatherContext } from "./WeatherContext";
import { SealBadge } from "@/components/seal/SealBadge";
import { StatusTimeline } from "@/components/report/StatusTimeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { Button } from "@/components/ui-tr";
import { stateFromReport, type VerificationState } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime, shortReportId } from "@/lib/design/format";
import { COPY } from "@/lib/design/copy";
import { cn } from "@/lib/utils";

export interface ReviewWorkbenchProps {
  reportId: string;
  /** True for the read-only report detail page (no action bar). */
  readOnly?: boolean;
  /** The current user's id (for the ReviewerGuard check). */
  currentUserId?: string;
  /** The current user's display name (for the resolved seal). */
  currentUserDisplayName?: string | null;
  /** The reviewer's role (for the role gate). */
  currentUserRole?: string;
  /** The next report's id (prefetched + navigated after a review action). */
  nextReportId?: string | null;
  /** Queue position (1-indexed) for the toast template. */
  queuePosition?: { current: number; total: number };
  className?: string;
}

interface ReportDetail {
  id: string;
  event_id: string;
  creator_id: string;
  status: string;
  retention_state?: "active" | "soft_deleted" | "purged" | null;
  review_outcome: string | null;
  title: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: string;
  location_label: string | null;
  image_width: number | null;
  image_height: number | null;
  captured_at: string | null;
  uploaded_at: string;
  priority_score: number | null;
  original_storage_key: string;
  derivative_storage_key: string;
  thumbnail_storage_key: string;
  report_analyses?: Array<{
    model_id: string;
    prompt_version: string;
    schema_version: string;
    structured_observation: Record<string, unknown>;
    created_at: string;
  }>;
}

interface PriorityResponse {
  ok?: boolean;
  computedScore?: number;
  factors?: Array<{
    name: string;
    maxPoints: number;
    points: number;
    status: string;
    explanation: string;
  }>;
  displayedScore?: number;
  override?: { new_score: number; reason: string } | null;
}

interface SegmentResponse {
  ok?: boolean;
  hasOverlay?: boolean;
  overlay?: SamOverlay | null;
  samConfigured?: boolean;
}

interface ReportBody {
  ok?: boolean;
  report?: ReportDetail;
  error?: { code?: string; message?: string };
}

interface ReviewBody {
  ok?: boolean;
  actions?: Array<{ reviewer_id: string; reviewer_name?: string; action: string; created_at: string; new_observation?: Record<string, unknown> | null }>;
}

function readObservation(detail: ReportDetail): ObservationData {
  const a = detail.report_analyses?.[0];
  const obs = (a?.structured_observation ?? {}) as Record<string, unknown>;
  return {
    incidentType: (obs.incident_type as string) ?? null,
    summary: (obs.summary_en as string) ?? null,
    severity: (obs.preliminary_severity as number) ?? null,
    visibleEvidence: (obs.visible_evidence as string[]) ?? [],
    uncertainties: (obs.uncertainties as string[]) ?? [],
    modelId: a?.model_id,
    isDemo: a?.model_id === "demo-mock-v1",
  };
}

export function ReviewWorkbench({
  reportId,
  readOnly = false,
  currentUserId,
  currentUserDisplayName,
  currentUserRole,
  nextReportId = null,
  queuePosition,
  className,
}: ReviewWorkbenchProps) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewWasCorrected, setReviewWasCorrected] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [priority, setPriority] = useState<{ score: number; factors: PriorityResponse["factors"] }>({
    score: 0,
    factors: [],
  });
  const [overlay, setOverlay] = useState<SamOverlay | null>(null);
  const [samAvailable, setSamAvailable] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    const ctrl = new AbortController();
    // Reset state when the report id changes. The setState-in-effect
    // pattern is intentional here — we need to clear the previous
    // report's data before fetching the new one. The eslint-disable
    // is per the standard reset-on-deps-change pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setDetail(null);
    setReviewWasCorrected(false);
    // Core report data is required; priority, SAM and review history are
    // supplementary. A failed optional request must not blank the whole page.
    Promise.allSettled([
      fetch(`/api/reports/${reportId}`, { signal: ctrl.signal }).then((r) => r.json() as Promise<ReportBody>),
      fetch(`/api/reports/${reportId}/priority`, { signal: ctrl.signal }).then((r) => r.json() as Promise<PriorityResponse>),
      fetch(`/api/reports/${reportId}/segment`, { signal: ctrl.signal }).then((r) => r.json() as Promise<SegmentResponse>),
      fetch(`/api/reports/${reportId}/review`, { signal: ctrl.signal }).then((r) => r.json() as Promise<ReviewBody>),
    ])
      .then(([reportResult, priorityResult, segmentResult, reviewResult]) => {
        if (ctrl.signal.aborted) return;
        const reportBody = reportResult.status === "fulfilled" ? reportResult.value : null;
        const priorityBody = priorityResult.status === "fulfilled" ? priorityResult.value : null;
        const segmentBody = segmentResult.status === "fulfilled" ? segmentResult.value : null;
        const reviewBody = reviewResult.status === "fulfilled" ? reviewResult.value : null;
        if (reportBody?.ok && reportBody.report) {
          setDetail(reportBody.report);
        } else {
          setError(reportBody?.error?.message ?? "Could not load report.");
          return;
        }
        if (priorityBody?.ok) {
          setPriority({
            score: priorityBody.displayedScore ?? priorityBody.computedScore ?? 0,
            factors: priorityBody.factors ?? [],
          });
        }
        if (segmentBody?.ok) {
          setSamAvailable(segmentBody.samConfigured ?? false);
          setOverlay(segmentBody.overlay ?? null);
        }
        if (reviewBody?.ok && Array.isArray(reviewBody.actions) && reviewBody.actions.length > 0) {
          const latest = reviewBody.actions[0];
          setReviewerName(latest.reviewer_name ?? currentUserDisplayName ?? null);
          setReviewedAt(latest.created_at);
          setReviewWasCorrected(latest.action === "comment" && latest.new_observation != null);
        } else if (reportBody.report.status === "reviewed") {
          setReviewerName(currentUserDisplayName ?? "a reviewer");
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("[review-workbench] Failed to load report", err);
        setError("Network error while loading the report.");
      });
    return () => ctrl.abort();
  }, [reportId, currentUserDisplayName]);

  if (error) {
    return (
      <div className="tr-page">
        <EmptyState
          title="Could not load the report"
          description={error}
          action={<Button variant="primary" href="/review">Back to review queue</Button>}
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="tr-page">
        <div aria-busy="true" aria-label="Loading report">
          <span className="skeleton" style={{ height: "60vh", width: "100%", display: "block" }} />
        </div>
      </div>
    );
  }

  const observation = readObservation(detail);
  const state: VerificationState = detail.status === "reviewed" && reviewWasCorrected
    ? "corrected"
    : stateFromReport({ status: detail.status, reviewOutcome: detail.review_outcome });
  const altText = `Uploaded photo; unverified description: ${observation.summary ?? "no AI summary available"}`;
  const isOwnReport = !!currentUserId && currentUserId === detail.creator_id;
  const isLastInQueue = queuePosition ? queuePosition.current >= queuePosition.total : false;

  // Map the priority factors to the component shape.
  const priorityFactors = (priority.factors ?? []).map((f) => ({
    name: f.name,
    value: f.points,
    weight: f.maxPoints,
    derivation: f.explanation,
    status: f.status as "assessed" | "unassessed" | "unverified",
  }));

  return (
    <div className={cn("tr-page", className)}>
      <PageHeader
        title={`Report ${shortReportId(detail.id)}`}
        subtitle={
          <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <SealBadge state={state} reviewerName={reviewerName} />
            <span className="t-meta">Uploaded {formatRelativeTime(detail.uploaded_at)}</span>
            {detail.captured_at && (
              <span className="t-meta">· Captured {formatRelativeTime(detail.captured_at)}</span>
            )}
          </span>
        }
        actions={
          !readOnly && (
            <Button variant="quiet" href="/review">Back to queue</Button>
          )
        }
      />
      <div className="tr-workbench">
        <div className="tr-workbench__viewer">
          <EvidenceViewer
            reportId={reportId}
            derivativeStorageKey={detail.derivative_storage_key}
            location={
              detail.latitude !== null && detail.longitude !== null
                ? { lat: detail.latitude, lon: detail.longitude, source: detail.location_source, label: detail.location_label ?? undefined }
                : null
            }
            imageWidth={detail.image_width ?? undefined}
            imageHeight={detail.image_height ?? undefined}
            altText={altText}
            retentionState={detail.retention_state ?? "active"}
            isContributor={isOwnReport}
            status={detail.status}
            reviewOutcome={detail.review_outcome}
            analysisTarget={(observation as ObservationData & { segmentation_target?: string }).segmentation_target ?? null}
            samAvailable={samAvailable}
            initialOverlay={overlay}
          />
        </div>
        <ObservationPanel
          status={detail.status}
          reviewOutcome={detail.review_outcome}
          reviewerName={reviewerName}
          reviewedAt={reviewedAt}
          resolving={resolving}
          observation={observation}
          priorityScore={priority.score}
          priorityFactors={priorityFactors}
          actionBar={
            !readOnly &&
            (currentUserRole === "reviewer" || currentUserRole === "admin") && (
              <ReviewActionBar
                reportId={reportId}
                isOwnReport={isOwnReport}
                isLastInQueue={isLastInQueue}
                queuePosition={queuePosition ?? { current: 1, total: 1 }}
                status={detail.status}
                reviewOutcome={detail.review_outcome}
                observation={observation}
                onResolvingChange={setResolving}
                nextHref={nextReportId ? `/review/${nextReportId}` : null}
              />
            )
          }
        />
      </div>
      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 className="t-label" style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Pipeline</h2>
        <StatusTimeline status={detail.status} />
      </section>
      <WeatherContext
        reportId={reportId}
        hasLocation={detail.location_source !== "unknown" && detail.latitude !== null && detail.longitude !== null}
      />
      {!readOnly && isOwnReport && (currentUserRole === "reviewer" || currentUserRole === "admin") && (
        <p className="t-meta" style={{ marginTop: "var(--s-4)" }}>
          {COPY.reviewerGuardSelf}
        </p>
      )}
    </div>
  );
}
