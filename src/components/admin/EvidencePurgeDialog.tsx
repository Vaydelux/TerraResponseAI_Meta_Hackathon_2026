// src/components/admin/EvidencePurgeDialog.tsx
//
// A native `<dialog>` (per docs/DESIGN.md §11) that states the 7-day
// retention rule + requires typing the report short ID (use
// `shortReportId`) to confirm. Calls POST /api/reports/[id]/retention?purge=1.
//
// Client component — manages the input + the request.

"use client";

import { useState } from "react";
import { Dialog, DialogActions, Field, Input, Button, toast } from "@/components/ui-tr";
import { shortReportId } from "@/lib/design/format";

export interface EvidencePurgeDialogProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
  /** Called when the purge succeeds. */
  onPurged?: () => void;
}

export function EvidencePurgeDialog({ open, onClose, reportId, onPurged }: EvidencePurgeDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const expected = shortReportId(reportId);
  const matches = confirmText.trim() === expected;

  async function handlePurge() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/retention?purge=1`, { method: "POST" });
      const body = await res.json();
      if (body?.ok) {
        toast.success("Evidence purged from storage. The audit trail is preserved.");
        onPurged?.();
        onClose();
        setConfirmText("");
      } else if (!body?.ok) {
        toast.error(body?.error?.message ?? "Purge failed.", {
          label: "Retry",
          onClick: () => void handlePurge(),
        });
      }
    } catch {
      toast.error("Network error during purge.", {
        label: "Retry",
        onClick: () => void handlePurge(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} aria-label="Purge evidence">
      <header style={{ marginBottom: "var(--s-4)" }}>
        <h2 style={{ fontSize: "var(--step-2)" }}>Purge evidence</h2>
      </header>
      <p style={{ marginBottom: "var(--s-3)" }}>
        After a soft-delete request, the evidence is held for 7 days before it can be purged. The
        reports row is preserved (with storage keys blanked) so the audit trail survives.
      </p>
      <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
        Type the report short ID <code className="num" style={{ fontWeight: 700 }}>{expected}</code> to confirm.
      </p>
      <Field label="Report short ID" htmlFor="purge-confirm">
        <Input
          id="purge-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={expected}
          autoComplete="off"
          aria-invalid={!matches && confirmText.length > 0 || undefined}
        />
      </Field>
      <DialogActions>
        <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={() => void handlePurge()} disabled={!matches || busy} busy={busy}>
          Purge evidence
        </Button>
      </DialogActions>
    </Dialog>
  );
}
