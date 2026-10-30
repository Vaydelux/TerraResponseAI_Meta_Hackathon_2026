// src/components/review/ReviewActionBar.tsx
//
// The sticky action bar at the bottom of the ObservationPanel. The
// four review verbs (per docs/DESIGN.md principle 5 "Humans own the
// verbs"):
//
//   - Confirm (C)   → POST /api/reports/[id]/review { action: "confirm" }
//   - Correct (E)   → opens the CorrectionForm drawer
//   - Flag (F)      → POST /api/reports/[id]/review { action: "flag" }
//   - Reject (R)    → opens a small reason prompt, then POST with action: "reject"
//
// Keyboard shortcuts (C / E / F / R + J/K for next/previous in the
// queue) — disabled while typing in a field. On success:
//   1. set `data-resolving="true"` on the Seal (triggers the resolve
//      animation in the CSS).
//   2. show a toast: `fill(COPY.reviewToastNext, { action, n, total })`.
//   3. prefetch the next queue item.
//   4. after 640ms (the seal animation duration), `router.replace(next)`.
//
// If `isOwnReport` is true (the reviewer is the contributor), the
// bar collapses to `.actions__locked` with `COPY.reviewerGuardSelf`
// (the ReviewerGuard — a contributor cannot review their own report).
//
// Client component — needs router.push + keyboard handlers.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogActions, Field, Textarea, toast } from "@/components/ui-tr";
import { CorrectionForm } from "./CorrectionForm";
import { COPY, fill } from "@/lib/design/copy";
import type { ObservationData } from "./ObservationPanel";
import { cn } from "@/lib/utils";

export interface ReviewActionBarProps {
  reportId: string;
  /** True if the current user is the contributor → ReviewerGuard. */
  isOwnReport: boolean;
  /** True if this is the last item in the queue (controls the toast). */
  isLastInQueue: boolean;
  /** Queue position (1-indexed) for the toast template. */
  queuePosition: { current: number; total: number };
  /** The report's status + review_outcome (used for the seal resolve). */
  status: string;
  reviewOutcome: string | null;
  /** The AI observation (for the CorrectionForm's prefill). */
  observation: ObservationData;
  /** Called when a review action resolves — the parent sets the Seal
   *  into the resolving state to play the resolve animation. */
  onResolvingChange?: (resolving: boolean) => void;
  /** Next queue item's URL (prefetched + navigated after a 640ms delay). */
  nextHref?: string | null;
  className?: string;
}

type ReviewAction = "confirm" | "correct" | "flag" | "reject";

export function ReviewActionBar({
  reportId,
  isOwnReport,
  isLastInQueue,
  queuePosition,
  status,
  reviewOutcome,
  observation,
  onResolvingChange,
  nextHref,
  className,
}: ReviewActionBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const rejectAbortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const completedRef = useRef(false);
  useEffect(() => {
    completedRef.current = false;
    submittingRef.current = false;
  }, [reportId]);

  // Keyboard shortcuts: C/E/F/R for the verbs, J/K for next/previous.
  // Disabled while typing in a field or while a dialog is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || t.closest("button, [role='dialog']")) return;
      if (isOwnReport || busy || submittingRef.current || completedRef.current || e.repeat) return;
      if (drawerOpen || rejectOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") { e.preventDefault(); void submitAction("confirm"); }
      else if (e.key === "e" || e.key === "E") { e.preventDefault(); setDrawerOpen(true); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); void submitAction("flag"); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); setRejectOpen(true); }
      else if ((e.key === "j" || e.key === "J") && nextHref) { e.preventDefault(); router.push(nextHref); }
      else if (e.key === "k" || e.key === "K") { e.preventDefault(); router.back(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, rejectOpen, nextHref, status, reviewOutcome, isOwnReport, busy]);

  async function submitAction(action: ReviewAction, reason?: string) {
    if (busy || submittingRef.current || completedRef.current || isOwnReport) return;
    submittingRef.current = true;
    setBusy(true);
    onResolvingChange?.(true);
    const ctrl = new AbortController();
    rejectAbortRef.current = ctrl;
    try {
      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason || undefined,
        }),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        completedRef.current = true;
        // Success — show the toast, then navigate to the next item.
        const nextN = Math.min(queuePosition.current + 1, queuePosition.total);
        toast.success(
          fill(COPY.reviewToastNext, {
            action: action,
            n: isLastInQueue ? queuePosition.total : nextN,
            total: queuePosition.total,
          }),
        );
        if (nextHref) {
          router.prefetch(nextHref);
        }
        // 640ms = the Seal's resolve animation duration (--t-seal).
        setTimeout(() => {
          if (nextHref) router.replace(nextHref);
          else router.refresh();
        }, 640);
      } else if (!body?.ok) {
        onResolvingChange?.(false);
        toast.error(body?.error?.message ?? `${action} failed.`, {
          label: "Retry",
          onClick: () => void submitAction(action, reason),
        });
      }
    } catch (err: unknown) {
      onResolvingChange?.(false);
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Network error during review action.", {
        label: "Retry",
        onClick: () => void submitAction(action, reason),
      });
    } finally {
      submittingRef.current = false;
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }

  async function submitReject() {
    if (!rejectReason.trim()) {
      toast.error("A reason is required to reject a report.");
      return;
    }
    setRejectOpen(false);
    await submitAction("reject", rejectReason);
    setRejectReason("");
  }

  if (isOwnReport) {
    return (
      <div className={cn("actions", className)}>
        <div className="actions__locked" role="alert">
          {COPY.reviewerGuardSelf}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn("actions", className)}>
        <Button
          variant="primary"
          block
          className="actions__confirm"
          onClick={() => void submitAction("confirm")}
          busy={busy}
          kbd="C"
        >
          Confirm
        </Button>
        <div className="actions__row">
          <Button variant="default" onClick={() => setDrawerOpen(true)} disabled={busy} kbd="E">Correct</Button>
          <Button variant="default" onClick={() => void submitAction("flag")} disabled={busy} kbd="F">Flag</Button>
          <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={busy} kbd="R">Reject</Button>
        </div>
      </div>

      <CorrectionForm
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        reportId={reportId}
        observation={observation}
        onSubmitted={() => {
          onResolvingChange?.(true);
          setTimeout(() => {
            if (nextHref) router.replace(nextHref);
            else router.refresh();
          }, 640);
        }}
      />

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} aria-label="Reject reason">
        <header style={{ marginBottom: "var(--s-4)" }}>
          <h2 style={{ fontSize: "var(--step-2)" }}>Reject this report</h2>
          <p className="t-meta">A reason is required for the audit trail.</p>
        </header>
        <Field label="Reason" htmlFor="reject-reason">
          <Textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="e.g. Not a disaster photo; mislabeled; out of scope"
            required
          />
        </Field>
        <DialogActions>
          <Button variant="quiet" onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => void submitReject()} disabled={!rejectReason.trim()}>Reject report</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
