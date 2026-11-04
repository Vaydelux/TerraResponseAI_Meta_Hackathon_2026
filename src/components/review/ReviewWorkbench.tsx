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
import { ContextualIntelligenceCard } from "./ContextualIntelligenceCard";
import type { ContextualIntelligenceData } from "@/lib/ai/contextual-intelligence";
import { PriorityOverride } from "@/components/admin/PriorityOverride";
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
import { getReviewCapabilities, type EventRole } from "@/lib/review/capabilities";

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
  /** Event-scoped roles assembled server-side for the authenticated actor. */
  currentUserEventRoles?: Array<{ eventId: string; role: EventRole }>;
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
    raw_usage_metadata?: Record<string, unknown> | null;
    processing_status?: string | null;
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
  const a = Array.isArray(detail.report_analyses) ? detail.report_analyses[0] : detail.report_analyses;
  const hasHumanCorrection = a?.raw_usage_metadata?._corrected_by != null;
  const valid = a?.processing_status === "succeeded" || hasHumanCorrection;
  const obs = (valid ? a?.structured_observation : null) as Record<string, unknown> | null;
  return {
    incidentType: (obs?.incident_type as string) ?? null,
    summary: (obs?.summary_en as string) ?? null,
    severity: (obs?.preliminary_severity as number) ?? null,
    visibleEvidence: (obs?.visible_evidence as string[]) ?? [],
    uncertainties: (obs?.uncertainties as string[]) ?? [],
    modelId: a?.processing_status === "succeeded" ? a.model_id : undefined,
    analysisAvailable: valid,
    humanOnlyAssessment: Boolean(hasHumanCorrection && a?.processing_status !== "succeeded"),
    isDemo: a?.model_id === "demo-mock-v1",
  };
}

export function ReviewWorkbench({
  reportId,
  readOnly = false,
  currentUserId,
  currentUserDisplayName,
  currentUserRole,
  currentUserEventRoles = [],
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
  const [priority, setPriority] = useState<{
    score: number;
    computedScore: number;
    override: { new_score: number; reason: string } | null;
    factors: PriorityResponse["factors"];
  }>({
    score: 0,
    computedScore: 0,
    override: null,
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
          const comp = priorityBody.computedScore ?? priorityBody.displayedScore ?? 0;
          setPriority({
            score: priorityBody.displayedScore ?? comp,
            computedScore: comp,
            override: priorityBody.override ?? null,
            factors: priorityBody.factors ?? [],
          });
        }
        if (segmentBody?.ok) {
          setSamAvailable(segmentBody.samConfigured ?? false);
          setOverlay(segmentBody.overlay ?? null);
        }
        if (reviewBody?.ok && Array.isArray(reviewBody.actions) && reviewBody.actions.length > 0) {
          const latest = reviewBody.actions[0];
          // The current viewer is NOT necessarily the actor who reviewed this report.
          setReviewerName(latest.reviewer_name ??
            (latest.reviewer_id === currentUserId ? currentUserDisplayName ?? null : null));
          setReviewedAt(latest.created_at);
          setReviewWasCorrected(latest.action === "comment" && latest.new_observation != null);
        } else if (reportBody.report.status === "reviewed") {
          // Older rows without history have no grounded reviewer display name.
          setReviewerName(null);
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("[review-workbench] Failed to load report", err);
        setError("Network error while loading the report.");
      });
    return () => ctrl.abort();
  }, [reportId, currentUserId, currentUserDisplayName]);

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
  const eventRole = currentUserEventRoles.find((e) => e.eventId === detail.event_id)?.role ?? null;
  const capabilities = getReviewCapabilities({
    globalRole: currentUserRole, eventRole, actorId: currentUserId,
    creatorId: detail.creator_id, status: detail.status,
    retentionState: detail.retention_state,
  });
  const primaryAnalysis = Array.isArray(detail.report_analyses) ? detail.report_analyses[0] : detail.report_analyses;
  const rawStructuredObs = ((primaryAnalysis as { structured_observation?: Record<string, unknown> } | undefined)?.structured_observation ?? {}) as Record<string, unknown>;
  const rawAnalysisMetadata =
    (primaryAnalysis as { raw_usage_metadata?: Record<string, unknown> | null } | undefined)?.raw_usage_metadata ?? null;
  const initialContextualIntelligence =
    ((rawAnalysisMetadata?.contextual_intelligence ??
      rawStructuredObs.contextual_intelligence) as ContextualIntelligenceData | undefined) ?? null;
  const state: VerificationState = detail.status === "reviewed" && reviewWasCorrected
    ? "corrected"
    : stateFromReport({ status: detail.status, reviewOutcome: detail.review_outcome });
  const altText = `Uploaded photo; unverified description: ${observation.summary ?? "no AI summary available"}`;
  const isOwnReport = capabilities.isOwn;
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
            analysisTarget={observation.analysisAvailable && typeof rawStructuredObs.segmentation_target === "string"
              ? rawStructuredObs.segmentation_target : null}
            samAvailable={samAvailable}
            canRequestSegmentation={capabilities.canSegment}
            segmentationUnavailableReason={capabilities.reason}
            initialOverlay={overlay}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4, 16px)", minWidth: 0 }}>
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
                  canReview={capabilities.canReview}
                  restrictionReason={capabilities.reason}
                  onReviewCommitted={({ status, reviewOutcome }) => {
                    setDetail((prev) => prev ? { ...prev, status, review_outcome: reviewOutcome } : prev);
                  }}
                  reportId={reportId}
                  isOwnReport={isOwnReport && currentUserRole !== "admin"}
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
          {!readOnly && capabilities.canOverridePriority && (
            <PriorityOverride
              reportId={reportId}
              computedScore={priority.computedScore}
              currentOverride={priority.override}
              onOverridden={(newScore, reason) =>
                setPriority((prev) => ({
                  ...prev,
                  score: newScore,
                  override: { new_score: newScore, reason },
                }))
              }
            />
          )}
          {(currentUserRole === "reviewer" || currentUserRole === "admin") && (
            <ContextualIntelligenceCard
              reportId={reportId}
              initialContext={initialContextualIntelligence}
              locationLabel={detail.location_label}
              latitude={detail.latitude}
              longitude={detail.longitude}
              incidentType={observation.incidentType}
            />
          )}
        </div>
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
