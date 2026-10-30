// src/components/review/CorrectionForm.tsx
//
// The correction drawer — opens when the reviewer clicks "Correct"
// in the ReviewActionBar. Pre-filled with the AI's values; the
// reviewer edits the incident_type, severity, summary, visible
// evidence, and uncertainties. Shows a visible diff (`.diff`):
// the AI's value struck in amber (`.diff__old`), the reviewer's new
// value in tide (`.diff__new`).
//
// On submit, calls POST /api/reports/[id]/review with
// action='comment' + the new observation. The route stores the
// before/after in `review_actions` (preserving the original model
// output) + updates the analysis's `structured_observation` with
// the corrected values.
//
// Uses the native `<dialog>` element for focus trapping (per
// docs/DESIGN.md §11). The `.drawer` CSS in components.css §7.6
// provides the visual chrome; we wrap the dialog in the `.drawer`
// class via the Dialog component (which uses `<dialog>`).
//
// Client component — manages form state + the submit.

"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogActions, Field, Input, Textarea, Select, Segmented } from "@/components/ui-tr";
import { Button } from "@/components/ui-tr";
import { toast } from "@/components/ui-tr/Toast";
import type { ObservationData } from "./ObservationPanel";

export interface CorrectionFormProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
  observation: ObservationData;
  /** Called when the correction is submitted successfully. */
  onSubmitted?: (newObservation: Partial<ObservationData>) => void;
}

const INCIDENT_OPTIONS = [
  { value: "flooding", label: "Flooding" },
  { value: "blocked_road", label: "Blocked road" },
  { value: "debris", label: "Debris" },
  { value: "visible_structural_damage", label: "Visible structural damage" },
  { value: "other", label: "Other" },
  { value: "unclear", label: "Unclear" },
];

export function CorrectionForm({
  open,
  onClose,
  reportId,
  observation,
  onSubmitted,
}: CorrectionFormProps) {
  const [incidentType, setIncidentType] = useState(observation.incidentType ?? "unclear");
  const [severity, setSeverity] = useState<number>(observation.severity ?? 3);
  const [summary, setSummary] = useState(observation.summary ?? "");
  const [evidence, setEvidence] = useState<string[]>(observation.visibleEvidence);
  const [uncertainties, setUncertainties] = useState<string[]>(observation.uncertainties);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when the drawer reopens with a new observation.
  useEffect(() => {
    if (!open) return;
    setIncidentType(observation.incidentType ?? "unclear");
    setSeverity(observation.severity ?? 3);
    setSummary(observation.summary ?? "");
    setEvidence(observation.visibleEvidence);
    setUncertainties(observation.uncertainties);
    setReason("");
  }, [open, observation]);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          reason: reason || "Reviewer correction",
          correctedIncidentType: incidentType,
          correctedSeverity: severity,
          correctedSummary: summary,
          correctedVisibleEvidence: evidence,
          correctedUncertainties: uncertainties,
        }),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (body?.ok) {
        toast.success("Correction submitted. The Seal now reads Corrected by you.");
        onSubmitted?.({
          incidentType,
          severity,
          summary,
          visibleEvidence: evidence,
          uncertainties,
        });
        onClose();
      } else if (!body?.ok) {
        toast.error(body?.error?.message ?? "Correction failed.", {
          label: "Retry",
          onClick: () => void handleSubmit(),
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Network error while submitting the correction.", {
        label: "Retry",
        onClick: () => void handleSubmit(),
      });
    } finally {
      if (!ctrl.signal.aborted) setSubmitting(false);
    }
  }

  // The diff rows — only show fields that differ from the AI's
  // original values. Each row is `.diff__old` (AI, amber strike) +
  // `.diff__new` (reviewer, tide).
  function renderDiff<T extends string | number>(label: string, old: T, next: T) {
    if (String(old) === String(next)) return null;
    return (
      <div>
        <div className="field__label">{label}</div>
        <div className="diff">
          <span className="diff__old">{String(old)}</span>
          <span className="diff__new">{String(next)}</span>
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label="Correction form"
      className="drawer"
    >
      <header style={{ display: "grid", gap: 4, marginBottom: "var(--s-4)" }}>
        <h2 style={{ fontSize: "var(--step-2)" }}>Correct the observation</h2>
        <p className="t-meta">
          Your edits overwrite the AI's values. The original is preserved in the audit trail.
        </p>
      </header>

      <div style={{ display: "grid", gap: "var(--s-4)" }}>
        {renderDiff("Incident type", observation.incidentType ?? "unclear", incidentType)}
        {renderDiff("Severity", observation.severity ?? 3, severity)}
        {renderDiff("Summary", observation.summary ?? "", summary)}

        <Field label="Incident type" htmlFor="cf-incident">
          <Select id="cf-incident" value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
            {INCIDENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Severity" htmlFor="cf-severity">
          <Segmented<string>
            aria-label="Corrected severity"
            block
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            value={String(severity)}
            onChange={(v) => setSeverity(Number(v))}
          />
        </Field>

        <Field label="Summary" htmlFor="cf-summary">
          <Textarea
            id="cf-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
          />
        </Field>

        <Field label="Visible evidence (one per line)" htmlFor="cf-evidence">
          <Textarea
            id="cf-evidence"
            value={evidence.join("\n")}
            onChange={(e) => setEvidence(e.target.value.split("\n").filter(Boolean))}
            rows={4}
          />
        </Field>

        <Field label="Uncertainties (one per line)" htmlFor="cf-uncertainties">
          <Textarea
            id="cf-uncertainties"
            value={uncertainties.join("\n")}
            onChange={(e) => setUncertainties(e.target.value.split("\n").filter(Boolean))}
            rows={4}
          />
        </Field>

        <Field label="Reason (required for audit trail)" htmlFor="cf-reason">
          <Input
            id="cf-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Image shows deeper water than the AI inferred"
            required
          />
        </Field>
      </div>

      <DialogActions>
        <Button variant="quiet" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => void handleSubmit()} busy={submitting} disabled={!reason}>
          Submit correction
        </Button>
      </DialogActions>
    </Dialog>
  );
}
