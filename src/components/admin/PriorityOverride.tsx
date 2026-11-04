// src/components/admin/PriorityOverride.tsx
//
// A small form to override a report's priority. Requires a reason.
// Displays the original score struck through beside the override.
// Calls POST /api/reports/[id]/priority with { newScore, reason }.
//
// Per the brief: "Permit only authorized coordinator/admin to
// override score with mandatory reason; preserve computed score,
// override and historical audit record separately."
//
// Client component — manages form state + the request.

"use client";

import { useRef, useState } from "react";
import { Field, Input, Textarea, Button, toast } from "@/components/ui-tr";
import { cn } from "@/lib/utils";

export interface PriorityOverrideProps {
  reportId: string;
  /** The original computed score (struck through beside the override). */
  computedScore: number;
  /** Optional existing override. */
  currentOverride?: { new_score: number; reason: string } | null;
  /** Called when the override is submitted successfully. */
  onOverridden?: (newScore: number, reason: string) => void;
  className?: string;
}

export function PriorityOverride({
  reportId,
  computedScore,
  currentOverride,
  onOverridden,
  className,
}: PriorityOverrideProps) {
  const [score, setScore] = useState<string>(currentOverride ? String(currentOverride.new_score) : String(computedScore));
  const [reason, setReason] = useState<string>(currentOverride?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  async function handleSubmit() {
    if (busy) return;
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      toast.error("Score must be an integer 0–100.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Enter a reason of at least three characters for the audit trail.");
      return;
    }
    setBusy(true);
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    try {
      const res = await fetch(`/api/reports/${reportId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newScore: n, reason: reason.trim(), requestId }),
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        requestIdRef.current = null;
        toast.success("Priority overridden. The computed score is preserved in the audit trail.");
        onOverridden?.(n, reason.trim());
      } else {
        const message = body?.error?.message ?? "Override failed.";
        if (res.status >= 500) {
          toast.error(message, { label: "Retry safely", onClick: () => void handleSubmit() });
        } else if (res.status === 409) {
          toast.error(message, { label: "Reload report", onClick: () => window.location.reload() });
        } else {
          requestIdRef.current = null;
          toast.error(message);
        }
      }
    } catch {
      toast.error("Network error during override.", {
        label: "Retry",
        onClick: () => void handleSubmit(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("panel", className)}>
      <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Override priority</h3>
      <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
        Only coordinators and administrators can override a report priority. Each change requires an audit reason; the database commits the override and new queue score together.
      </p>
      <div style={{ display: "grid", gap: "var(--s-3)" }}>
        <Field label={`New score (computed: ${computedScore})`} htmlFor="po-score">
          <Input
            id="po-score"
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => { setScore(e.target.value); requestIdRef.current = null; }}
          />
        </Field>
        <Field label="Reason (required)" htmlFor="po-reason">
          <Textarea
            id="po-reason"
            rows={3}
            value={reason}
            onChange={(e) => { setReason(e.target.value); requestIdRef.current = null; }}
            placeholder="e.g. Field team reports this incident is contained"
            required
          />
        </Field>
        <div className="tr-cluster" style={{ justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={() => void handleSubmit()} busy={busy} disabled={reason.trim().length < 3}>
            Submit override
          </Button>
        </div>
      </div>
    </div>
  );
}
