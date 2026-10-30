"use client";

// src/app/(app)/reports/[id]/EvidencePurgeLauncher.tsx
//
// The "Request evidence deletion" button on the report detail page.
// Opens the EvidencePurgeDialog. The dialog states the 7-day
// retention rule + requires typing the report short ID to confirm.

import { useState } from "react";
import { Button } from "@/components/ui-tr";
import { EvidencePurgeDialog } from "@/components/admin/EvidencePurgeDialog";
import { COPY } from "@/lib/design/copy";

export function EvidencePurgeLauncher({
  reportId,
  currentRole,
}: {
  reportId: string;
  currentRole: string;
}) {
  const [open, setOpen] = useState(false);
  // Only reviewers + admins see the purge launcher in this build.
  // The contributor's retention-request path is a separate button
  // (POST without purge=1).
  if (currentRole !== "admin") return null;
  return (
    <div className="tr-page" style={{ marginTop: "var(--s-6)", borderTop: "1px solid var(--rule)", paddingTop: "var(--s-5)" }}>
      <h2 className="t-label" style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-2)" }}>
        Evidence retention
      </h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
        After a soft-delete request, evidence is held for 7 days before it can be purged. The audit trail is preserved.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Purge evidence
      </Button>
      <EvidencePurgeDialog
        open={open}
        onClose={() => setOpen(false)}
        reportId={reportId}
        onPurged={() => {
          // Reload the page so the viewer's retention-state branch
          // (410 GONE) takes effect.
          if (typeof window !== "undefined") window.location.reload();
        }}
      />
    </div>
  );
}
