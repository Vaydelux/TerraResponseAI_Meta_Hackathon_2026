"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, MapPin, Pin, PinOff } from "lucide-react";
import { SealBadge } from "@/components/seal/SealBadge";
import { formatAbsoluteTime, formatCoords } from "@/lib/design/format";
import { stateFromReport } from "@/lib/design/status";
import { cn } from "@/lib/utils";
import { hasMapLocation, reportTitle } from "@/lib/workspace/incidents";
import { ReportThumb } from "./ReportThumb";
import type { ReportAuditEntry, ReportRowData } from "./ReportRow";

export interface IncidentEvidenceDetailsProps {
  report: ReportRowData;
  canReview?: boolean;
  onPin?: () => void;
  pinned?: boolean;
  reviewerName?: string | null;
  /** Only pass a summary returned by the report's actual analysis. */
  summary?: string | null;
  modelId?: string | null;
  auditTrail?: ReportAuditEntry[];
}

export const INCIDENT_ACTION_CLASSES = "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 rounded-ctl border border-[var(--rule)] px-4 py-3 text-center text-sm leading-snug font-semibold whitespace-normal transition-colors [overflow-wrap:anywhere] [&>svg]:shrink-0 hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
export const INCIDENT_ICON_ACTION_CLASSES = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-ctl border border-[var(--rule)] bg-sheet text-ink transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none";

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordedTime(value: unknown): string {
  const timestamp = textField(value);
  return timestamp ? formatAbsoluteTime(timestamp) || "Time unavailable" : "Time unavailable";
}

/** Ignore malformed audit records without inventing activity or stage times. */
function availableAuditEntries(value: unknown): ReportAuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const action = textField(item.action);
    if (!action) return [];
    return [{
      id: textField(item.id) ?? undefined,
      action,
      created_at: textField(item.created_at) ?? "",
      actor_name: textField(item.actor_name),
      actor_email: textField(item.actor_email),
      details: textField(item.details),
    }];
  });
}

function EvidenceActions({ report, canReview, onPin, pinned }: Pick<IncidentEvidenceDetailsProps, "report" | "canReview" | "onPin" | "pinned">) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const hasCoords = hasMapLocation(report);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  async function copyCoordinates() {
    if (!hasCoords) return;
    const request = ++requestRef.current;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(`${report.latitude}, ${report.longitude}`);
      if (mountedRef.current && requestRef.current === request) setCopyState("copied");
    } catch {
      if (mountedRef.current && requestRef.current === request) setCopyState("failed");
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Link href={`/reports/${report.id}`} className={cn(INCIDENT_ACTION_CLASSES, "border-transparent bg-tide text-[var(--on-tide)] hover:bg-[var(--tide-hover)] hover:text-[var(--on-tide)] active:bg-[var(--tide-press)]")}>
        Open full report <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      {canReview && report.status !== "reviewed" && (
        <Link href={`/review/${report.id}`} className={INCIDENT_ACTION_CLASSES}>
          Open review workbench <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      )}
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {hasCoords && (
          <button type="button" onClick={copyCoordinates} disabled={copyState === "copying"} aria-busy={copyState === "copying"} className={INCIDENT_ACTION_CLASSES}>
            {copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copyState === "copied" ? "Coordinates copied" : copyState === "copying" ? "Copying coordinates…" : "Copy coordinates"}
          </button>
        )}
        {onPin && (
          <button type="button" onClick={onPin} aria-pressed={pinned} className={cn(INCIDENT_ACTION_CLASSES, "aria-pressed:border-tide aria-pressed:bg-[var(--tide-wash)] aria-pressed:text-tide")}>
            {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
            {pinned ? "Unpin report" : "Pin report"}
          </button>
        )}
      </div>
      <p className="min-h-4 break-words text-xs leading-relaxed text-[var(--ink-3)] [overflow-wrap:anywhere]" role="status">
        {copyState === "failed"
          ? "Coordinates could not be copied. Select the coordinate text above to copy it manually."
          : copyState === "copied" ? "Coordinate text copied to your clipboard." : copyState === "copying" ? "Copying coordinate text to your clipboard." : ""}
      </p>
    </div>
  );
}

function RecordedActivity({ entries }: { entries: ReportAuditEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="grid min-w-0 gap-2" aria-label="Recorded activity">
      <h4 className="text-sm font-semibold">Recorded activity</h4>
      <ol className="grid min-w-0 gap-3">
        {entries.map((entry, index) => (
          <li key={entry.id || `${entry.action}-${index}`} className="grid min-w-0 gap-1 border-l-2 border-[var(--rule)] pl-3">
            <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{entry.action.replace(/_/g, " ")}</span>
            <span className="break-words text-xs text-[var(--ink-3)] [overflow-wrap:anywhere]">
              {recordedTime(entry.created_at)}{entry.actor_name || entry.actor_email ? ` · ${entry.actor_name || entry.actor_email}` : ""}
            </span>
            {entry.details && <p className="break-words text-sm text-[var(--ink-2)] [overflow-wrap:anywhere]">{entry.details}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Shared evidence presentation. Missing fields remain missing. */
export function IncidentEvidenceDetails({ report, canReview = false, onPin, pinned = false, reviewerName, summary, modelId, auditTrail }: IncidentEvidenceDetailsProps) {
  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const title = reportTitle({ ...report, title: textField(report.title) });
  const description = textField(report.description);
  const locationLabel = textField(report.location_label);
  const incidentType = textField(report.incident_type);
  const observationSummary = textField(summary);
  const analysisModel = textField(modelId);
  const coords = hasMapLocation(report) ? formatCoords(report.latitude, report.longitude) : null;
  const priority = typeof report.priority_score === "number" && Number.isFinite(report.priority_score) ? report.priority_score : null;
  const severity = typeof report.severity === "number" && Number.isInteger(report.severity) && report.severity >= 1 && report.severity <= 5 ? report.severity : null;
  const entries = availableAuditEntries(auditTrail ?? report.audit_trail);
  const hasObservation = Boolean(incidentType || severity !== null || observationSummary);

  return (
    <article className="grid min-w-0 max-w-full gap-4 text-ink" aria-label="Incident evidence details">
      <header className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="break-all font-mono text-xs text-[var(--ink-3)]">#{report.id.slice(0, 8)}</span>
          <div className="min-w-0 max-w-full [&_.seal]:max-w-full [&_.seal]:min-w-0 [&_.seal]:leading-relaxed [&_.seal>span:last-child]:min-w-0 [&_.seal>span:last-child]:break-words [&_.seal>span:last-child]:[overflow-wrap:anywhere]">
            <SealBadge state={state} reviewerName={textField(reviewerName)} />
          </div>
        </div>
        <h3 className="break-words text-[length:var(--step-1)] leading-snug font-semibold [overflow-wrap:anywhere]">{title}</h3>
        <div className="flex min-w-0 items-start gap-2 text-sm text-[var(--ink-2)]">
          <MapPin size={16} className="mt-0.5 shrink-0 text-tide" aria-hidden="true" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{locationLabel || coords || "Location unavailable"}</span>
        </div>
      </header>

      <figure className="grid min-w-0 overflow-hidden rounded-ctl border border-[var(--rule)] bg-[var(--sheet-sunk)]">
        <div className="grid min-w-0 gap-1 border-b border-[var(--rule)] bg-[var(--amber-wash)] px-3 py-2 text-[var(--amber-ink)]">
          <p className="text-sm font-semibold">AI generated, not verified</p>
          <p className="break-words text-xs leading-relaxed">This label applies to the original AI observation. The uploaded photograph’s authenticity is not assessed. Actual human review is shown separately above.</p>
        </div>
        <div className="aspect-video min-w-0 overflow-hidden">
          <ReportThumb reportId={report.id} state={state} alt={`Uploaded evidence for ${title}`} showRetry className="h-full w-full object-cover" />
        </div>
        <figcaption className="break-words border-t border-[var(--rule)] bg-sheet px-3 py-2 text-xs leading-relaxed text-[var(--ink-2)]">Uploaded evidence · authenticity not assessed</figcaption>
      </figure>

      <dl className="grid min-w-0 grid-cols-1 gap-3 rounded-ctl border border-[var(--rule)] bg-[var(--sheet-sunk)] p-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1"><dt className="text-xs text-[var(--ink-3)]">Priority score</dt><dd className="break-words font-mono text-base font-semibold">{priority ?? "Unscored"}</dd></div>
        <div className="grid min-w-0 gap-1"><dt className="text-xs text-[var(--ink-3)]">Provisional severity</dt><dd className="break-words font-mono text-base font-semibold">{severity !== null ? `${severity}/5` : "Not assessed"}</dd></div>
        <div className="grid min-w-0 gap-1"><dt className="text-xs text-[var(--ink-3)]">Uploaded</dt><dd className="break-words text-sm">{recordedTime(report.uploaded_at)}</dd></div>
        <div className="grid min-w-0 gap-1"><dt className="text-xs text-[var(--ink-3)]">Coordinates</dt><dd className="break-words font-mono text-xs [overflow-wrap:anywhere]">{coords || "Unavailable"}</dd></div>
      </dl>

      <section className="grid min-w-0 gap-2" aria-label="Submitted description">
        <h4 className="text-sm font-semibold">Submitted description</h4>
        <p className="break-words text-sm leading-relaxed text-[var(--ink-2)] [overflow-wrap:anywhere]">{description || "No description was submitted."}</p>
      </section>

      <section className="grid min-w-0 gap-3 overflow-hidden rounded-ctl border border-[var(--rule)]" aria-label="AI observation">
        <h4 className="border-b border-[var(--rule)] bg-sheet px-3 py-2 text-sm font-semibold">AI observation</h4>
        <div className="grid min-w-0 gap-2 px-3 pb-3 text-sm text-[var(--ink-2)]">
          {analysisModel && (
            <p className="break-words font-mono text-xs [overflow-wrap:anywhere]">
              {analysisModel === "demo-mock-v1" ? "Demonstration analysis · " : "Analysis model: "}{analysisModel}
            </p>
          )}
          {hasObservation ? <>
            <p className="break-words [overflow-wrap:anywhere]">Hazard classification: {incidentType?.replace(/_/g, " ") || "Not classified"}</p>
            {observationSummary && <p className="break-words leading-relaxed [overflow-wrap:anywhere]">{observationSummary}</p>}
            {state === "confirmed" && <p>Human confirmation is recorded separately in the review status above.</p>}
          </> : <p>{state === "failed" ? "AI analysis is unavailable. A reviewer can inspect the uploaded evidence." : "No AI observation is available in this snapshot."}</p>}
        </div>
      </section>

      <RecordedActivity entries={entries} />
      <EvidenceActions key={`${report.id}:${report.latitude}:${report.longitude}:${report.location_source}`} report={report} canReview={canReview} onPin={onPin} pinned={pinned} />
    </article>
  );
}
