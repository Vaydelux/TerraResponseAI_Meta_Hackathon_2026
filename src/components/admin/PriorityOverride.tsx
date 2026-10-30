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

import { useState } from "react";
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

  async function handleSubmit() {
    if (busy) return;
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      toast.error("Score must be an integer 0–100.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for the audit trail.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newScore: n, reason: reason.trim() }),
      });
      const body = await res.json();
      if (body?.ok) {
        toast.success("Priority overridden. The computed score is preserved in the audit trail.");
        onOverridden?.(n, reason.trim());
      } else if (!body?.ok) {
        toast.error(body?.error?.message ?? "Override failed.", {
          label: "Retry",
          onClick: () => void handleSubmit(),
        });
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
        The original computed score is preserved alongside this override in the audit trail.
      </p>
      <div style={{ display: "grid", gap: "var(--s-3)" }}>
        <Field label={`New score (computed: ${computedScore})`} htmlFor="po-score">
          <Input
            id="po-score"
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </Field>
        <Field label="Reason (required)" htmlFor="po-reason">
          <Textarea
            id="po-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Field team reports this incident is contained"
            required
          />
        </Field>
        <div className="tr-cluster" style={{ justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={() => void handleSubmit()} busy={busy} disabled={!reason.trim()}>
            Submit override
          </Button>
        </div>
      </div>
    </div>
  );
}
