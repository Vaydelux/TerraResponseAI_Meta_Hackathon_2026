// src/components/report/StatusTimeline.tsx
//
// The 4-step pipeline timeline (components.css §7.8): Uploaded →
// Checked → Analyzed → Waiting for review. Steps are marked
// `data-done` (green checkmark) or `data-current` (amber hatched).
//
// The mapping from the report's status:
//   - uploaded          → step 1 done, step 2+ pending
//   - analyzing         → steps 1-2 done, step 3 current, step 4 pending
//   - needs_review      → steps 1-3 done, step 4 current
//   - needs_manual_review → steps 1-2 done, step 3 failed (data-current)
//   - retryable_error   → step 1 done, step 2 current (failed)
//   - reviewed          → all steps done
//
// Server-component friendly.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatusTimelineProps {
  /** The report's status string from the DB (uploaded/analyzing/
   *  needs_review/needs_manual_review/reviewed/retryable_error). */
  status: string;
  className?: string;
}

interface Step {
  label: string;
  description?: ReactNode;
}

const STEPS: Step[] = [
  { label: "Uploaded", description: "Photo received, signed URL minted" },
  { label: "Checked", description: "File validated, EXIF read, derivatives stored" },
  { label: "Analyzed", description: "AI observation produced, schema validated" },
  { label: "Waiting for review", description: "A reviewer decides what's true" },
];

/**
 * Map the report's status to a 4-step done/current/pending state.
 * Returns the index of the "current" step (0-based) and the
 * number of "done" steps (the steps before the current one).
 */
function statusToStep(status: string): { done: number; current: number | null; failed: boolean } {
  switch (status) {
    case "uploaded":
      return { done: 1, current: 1, failed: false };
    case "analyzing":
      return { done: 2, current: 2, failed: false };
    case "needs_review":
      return { done: 3, current: 3, failed: false };
    case "needs_manual_review":
      return { done: 2, current: 2, failed: true };
    case "retryable_error":
      return { done: 1, current: 1, failed: true };
    case "reviewed":
      return { done: 4, current: null, failed: false };
    default:
      return { done: 0, current: 0, failed: false };
  }
}

export function StatusTimeline({ status, className }: StatusTimelineProps) {
  const { done, current, failed } = statusToStep(status);
  return (
    <ol className={cn("timeline", className)} aria-label="Report status timeline">
      {STEPS.map((step, i) => {
        const isDone = i < done;
        const isCurrent = i === current;
        const isFailed = failed && isCurrent;
        return (
          <li
            key={step.label}
            className="timeline__step"
            data-done={isDone || undefined}
            data-current={isCurrent || undefined}
            data-failed={isFailed || undefined}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="timeline__dot" aria-hidden="true">
              {isDone && (
                <svg width={12} height={12} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 9.2 7.2 12.7 14.4 5.4" />
                </svg>
              )}
              {isCurrent && !isDone && (
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: "var(--amber)" }} />
              )}
            </span>
            <div>
              <div className="t-label" style={{ fontWeight: 700 }}>
                {step.label}
                {isFailed && <span style={{ color: "var(--brick-ink)" }}> · failed</span>}
              </div>
              {step.description && <div className="t-meta">{step.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
