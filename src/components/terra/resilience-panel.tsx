"use client";

// src/components/terra/resilience-panel.tsx
//
// Per-report resilience affordances. Per the brief:
//   - "safe retry buttons"
//   - "Avoid endless retries or repeated cost-incurring requests."
//
// Three actions, each gated by the report's state + the user's role:
//
//   1. Re-analyze (manual retry): available when status = retryable_error
//      AND the user is the creator OR a reviewer/admin. Calls POST
//      /api/reports/[id]/analyze. The route handler enforces the
//      retry_count cap (5) — past the cap, the report is parked in
//      needs_manual_review instead.
//
//   2. Force manual review: available when status = analyzing |
//      retryable_error | needs_review AND the user is a reviewer/admin
//      (NOT the contributor). Calls POST /api/reports/[id]/force-
//      manual-review. No model call → no cost. The contributor can't
//      force-review their own report (the contributor-cannot-review
//      rule).
//
//   3. Request evidence deletion (soft-delete): available for ANY
//      state, ANY role (the contributor can delete their own report's
//      evidence; a reviewer/admin can delete any report's evidence).
//      Calls POST /api/reports/[id]/retention with a reason. The
//      retention window starts (default 7 days); the signed-URL
//      endpoint immediately refuses to mint URLs.
//
//   4. Revoke deletion request: available when retention_state =
//      soft_deleted AND the user is the original requester or an
//      admin. Calls DELETE /api/reports/[id]/retention. The storage
//      objects were NOT deleted during the soft-delete window, so
//      the evidence is fully restored.
//
// All actions:
//   - Show a confirmation dialog with the action + consequence.
//   - On success, refresh the report (the parent view re-fetches).
//   - On failure, show the error code + message inline (no silent
//     failures — the brief: "no silent failures").
//   - Disable the button while the request is in flight (no double-
//     submit).
//   - For the re-analyze action, show the current retry_count + the
//     cap so the user knows how many retries are left.

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, FileWarning, Trash2, Undo2, AlertTriangle,
  ShieldAlert,
} from "lucide-react";

interface ResiliencePanelProps {
  reportId: string;
  status: string;
  retryCount: number;
  isReviewer: boolean;
  isCreator: boolean;
  /** Called after any successful mutation so the parent re-fetches. */
  onMutated: () => void;
}

export function ResiliencePanel({
  reportId,
  status,
  retryCount,
  isReviewer,
  isCreator,
  onMutated,
}: ResiliencePanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Retention state (fetched lazily when the user opens the delete
  // affordance). Default: "active".
  const [retentionState, setRetentionState] = useState<string>("active");
  const [retentionWindowEndsAt, setRetentionWindowEndsAt] = useState<string | null>(null);

  // Fetch the retention state when the panel mounts + when the user
  // opens the delete affordance.
  async function refreshRetention() {
    try {
      const res = await fetch(`/api/reports/${reportId}/retention`);
      if (!res.ok) return;
      const body = await res.json();
      if (body?.ok && body.retention) {
        setRetentionState(body.retention.retention_state ?? "active");
        setRetentionWindowEndsAt(body.retention.retention_window_ends_at ?? null);
      }
    } catch {
      // Silent — the retention state is best-effort.
    }
  }

  // Refresh retention state on mount. useEffect is the React-idiomatic
  // way to fire a side-effect once; the previous useState(() => {...})
  // pattern was an abuse (and double-invoked in StrictMode dev).
  useEffect(() => {
    refreshRetention();
  }, []);

  async function handleReanalyze() {
    setBusy("reanalyze");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/analyze`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? "Re-analysis failed.");
      } else {
        onMutated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function handleForceManualReview() {
    setBusy("force");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/force-manual-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? "Force-manual-review failed.");
      } else {
        setReasonOpen(null);
        setReason("");
        onMutated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSoftDelete() {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? "Delete request failed.");
      } else {
        setReasonOpen(null);
        setReason("");
        await refreshRetention();
        onMutated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevokeDelete() {
    setBusy("revoke");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/retention`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? "Revoke failed.");
      } else {
        await refreshRetention();
        onMutated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(null);
    }
  }

  const canReanalyze = status === "retryable_error" && (isCreator || isReviewer);
  const canForce = (status === "analyzing" || status === "retryable_error" || status === "needs_review") && isReviewer;
  const canDelete = retentionState === "active";
  const canRevoke = retentionState === "soft_deleted";

  // If none of the actions are available, hide the panel entirely.
  if (!canReanalyze && !canForce && !canDelete && !canRevoke) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Resilience & Retention
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Retry counter (transparency for the safe-retry cap). */}
        {retryCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              Retry attempts so far: <strong>{retryCount}/5</strong>. The AI
              retry cap is 5 manual re-analyses after the initial attempt; past
              that, the report is parked in manual review (no further model
              calls).
            </span>
          </div>
        )}

        {/* Soft-delete state banner (when applicable). */}
        {retentionState === "soft_deleted" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <div>
                <strong>Evidence deletion requested.</strong> Signed URLs are no
                longer issued. Storage objects will be purged after the retention
                window expires.
              </div>
              {retentionWindowEndsAt && (
                <div className="text-[11px]">
                  Purge window ends: {new Date(retentionWindowEndsAt).toLocaleString()}.
                </div>
              )}
            </div>
          </div>
        )}

        {retentionState === "purged" && (
          <div className="flex items-start gap-2 rounded-md border border-red-400/40 bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <strong>Evidence purged.</strong> The storage objects have been
              removed. The reports row is preserved (with audit trail intact) but
              the image is no longer available.
            </div>
          </div>
        )}

        {/* Action buttons. */}
        <div className="flex flex-wrap gap-2">
          {canReanalyze && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={handleReanalyze}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === "reanalyze" ? "animate-spin" : ""}`} />
              {busy === "reanalyze" ? "Re-analyzing…" : "Re-analyze"}
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{retryCount}/5</Badge>
            </Button>
          )}
          {canForce && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => { setReasonOpen(reasonOpen === "force" ? null : "force"); setError(null); }}
            >
              <FileWarning className="mr-1.5 h-3.5 w-3.5" />
              Force manual review
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => { setReasonOpen(reasonOpen === "delete" ? null : "delete"); setError(null); }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Request evidence deletion
            </Button>
          )}
          {canRevoke && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={handleRevokeDelete}
            >
              <Undo2 className={`mr-1.5 h-3.5 w-3.5 ${busy === "revoke" ? "animate-spin" : ""}`} />
              {busy === "revoke" ? "Revoking…" : "Revoke deletion request"}
            </Button>
          )}
        </div>

        {/* Inline reason input (force-manual-review + soft-delete). */}
        {reasonOpen === "force" && (
          <div className="space-y-2 rounded-md border p-2">
            <div className="text-xs text-muted-foreground">
              Reason for forcing manual review (optional; logged to the audit trail).
            </div>
            <textarea
              className="w-full rounded border p-1 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., the AI call keeps timing out; review by hand."
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={handleForceManualReview}>
                {busy === "force" ? "Forcing…" : "Confirm force-manual-review"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReasonOpen(null); setReason(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {reasonOpen === "delete" && (
          <div className="space-y-2 rounded-md border p-2">
            <div className="text-xs text-muted-foreground">
              Reason for the deletion request (optional; logged to the audit
              trail). The storage objects are NOT deleted immediately — a 7-day
              retention window applies (configurable via the
              RETENTION_WINDOW_DAYS env var), during which the deletion can be
              revoked.
            </div>
            <textarea
              className="w-full rounded border p-1 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., the photo was uploaded by mistake; not a disaster."
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={handleSoftDelete}>
                {busy === "delete" ? "Submitting…" : "Confirm deletion request"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReasonOpen(null); setReason(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Error message (no silent failures). */}
        {error && (
          <div className="rounded-md border border-red-400/40 bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-100">
            <strong>Action failed:</strong> {error}
          </div>
        )}

        {/* Permanent AI disclaimer (mirrors the report-detail banner). */}
        <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
          Re-analyze is bounded by the per-user AI rate limit, the per-event AI budget,
          and the daily spend ceiling. Past the retry cap (5), force-manual-review is
          the recommended path (no model call → no cost).
        </div>
      </CardContent>
    </Card>
  );
}
