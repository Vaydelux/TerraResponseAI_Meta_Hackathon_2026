"use client";

// src/components/terra/reviewer-action-panel.tsx
//
// Reviewer action panel. Per the brief:
//   - "Reviewer can confirm, correct, reject, or request more
//     information."
//   - "Preserve original model output and separately store reviewer
//     corrections with reviewer ID, timestamp, before/after
//     differences, and reason."
//   - "Add field verification as explicitly human-reported, not
//     model-derived."
//   - "Any correction must update visible review status and audit
//     trail."
//
// Shows:
//   - The AI observation (read-only, with "AI-generated, not verified" label)
//   - Action buttons: Confirm, Correct, Reject, Request info
//   - Correction form (when "Correct" is selected): editable fields
//     with before/after + required reason
//   - Review action history (the audit trail)

import { useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/terra/states";
import {
  ShieldCheck, Flag, Ban, MessageSquare, AlertTriangle,
  Loader2, CheckCircle2, History, Edit,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type ActionType = "confirm" | "flag" | "reject" | "request_info";

interface Observation {
  incident_type: string;
  visible_evidence: string[];
  preliminary_severity: number | null;
  uncertainties: string[];
  summary_en: string;
  summary_tl: string;
  needs_review: boolean;
  segmentation_target: string | null;
}

interface ReviewAction {
  id: string;
  reviewer_id: string;
  action: string;
  comment: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_observation: Record<string, unknown> | null;
  new_observation: Record<string, unknown> | null;
  previous_severity: number | null;
  new_severity: number | null;
  created_at: string;
}

interface ReviewerActionPanelProps {
  reportId: string;
  reportStatus: string;
  observation: Observation | null;
  isReviewer: boolean;
}

export function ReviewerActionPanel({
  reportId,
  reportStatus,
  observation,
  isReviewer,
}: ReviewerActionPanelProps) {
  const [action, setAction] = useState<ActionType | null>(null);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<ReviewAction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Correction fields
  const [correctedIncidentType, setCorrectedIncidentType] = useState("");
  const [correctedSeverity, setCorrectedSeverity] = useState<string>("");
  const [correctedSummary, setCorrectedSummary] = useState("");
  const [correctedSummaryTl, setCorrectedSummaryTl] = useState("");

  const configured = isSupabaseConfigured();
  const isReviewed = reportStatus === "reviewed";

  // Fetch review action history.
  useEffect(() => {
    if (!configured) return;
    fetch(`/api/reports/${reportId}/review`)
      .then((r) => r.json())
      .then((body) => {
        if (body?.ok && Array.isArray(body.actions)) {
          setHistory(body.actions);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [configured, reportId]);

  // Initialize correction fields from the observation.
  useEffect(() => {
    if (observation) {
      setCorrectedIncidentType(observation.incident_type);
      setCorrectedSeverity(observation.preliminary_severity?.toString() ?? "");
      setCorrectedSummary(observation.summary_en);
      setCorrectedSummaryTl(observation.summary_tl);
    }
  }, [observation]);

  async function handleSubmit() {
    if (!action) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { action, comment: comment || undefined };
      if (action === "confirm" && observation) {
        // Check if corrections were made.
        const hasCorrections =
          correctedIncidentType !== observation.incident_type ||
          correctedSummary !== observation.summary_en ||
          correctedSummaryTl !== observation.summary_tl ||
          (correctedSeverity && correctedSeverity !== observation.preliminary_severity?.toString());
        if (hasCorrections) {
          payload.correctedIncidentType = correctedIncidentType;
          payload.correctedSeverity = correctedSeverity ? parseInt(correctedSeverity) : null;
          payload.correctedSummary = correctedSummary;
          payload.correctedSummaryTl = correctedSummaryTl;
          payload.reason = reason;
        }
      }
      if (action === "request_info" || action === "reject" || action === "flag") {
        payload.comment = comment || reason || undefined;
      }

      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error?.message ?? "Review action failed.");
        return;
      }
      toast.success(`Action "${action}" applied successfully.`);
      setAction(null);
      setComment("");
      setReason("");
      // Refresh the page to show the updated status.
      window.location.reload();
    } catch {
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isReviewer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Review Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only reviewers and admins can perform review actions. Your role
            does not permit review.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isReviewed) {
    return (
      <div className="space-y-4">
        <Card className="border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              Review completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              This report has been reviewed. The review action history is below.
            </p>
          </CardContent>
        </Card>
        <ReviewHistory history={history} loading={historyLoading} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI observation (read-only, with permanent AI label) */}
      {observation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              AI Observation
            </CardTitle>
            <CardDescription>
              This is the AI-generated observation. It is <strong>not a verified finding</strong>.
              Review the fields below and confirm, correct, or reject.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-[10px] text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                AI-generated, not verified
              </Badge>
            </div>
            <div><span className="text-muted-foreground">Incident type:</span> {observation.incident_type}</div>
            <div><span className="text-muted-foreground">Preliminary severity:</span> {observation.preliminary_severity ?? "cannot determine"}</div>
            <div><span className="text-muted-foreground">Summary (EN):</span> {observation.summary_en}</div>
            <div><span className="text-muted-foreground">Summary (TL draft):</span> {observation.summary_tl}</div>
            <div><span className="text-muted-foreground">Visible evidence:</span>
              <ul className="ml-4 list-disc">{observation.visible_evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
            <div><span className="text-muted-foreground">Uncertainties:</span>
              <ul className="ml-4 list-disc">{observation.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={action === "confirm" ? "default" : "outline"}
          size="sm"
          onClick={() => setAction("confirm")}
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
          Confirm / Correct
        </Button>
        <Button
          variant={action === "request_info" ? "default" : "outline"}
          size="sm"
          onClick={() => setAction("request_info")}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Request info
        </Button>
        <Button
          variant={action === "reject" ? "default" : "outline"}
          size="sm"
          onClick={() => setAction("reject")}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Reject
        </Button>
        <Button
          variant={action === "flag" ? "default" : "outline"}
          size="sm"
          onClick={() => setAction("flag")}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" />
          Flag
        </Button>
      </div>

      {/* Action form */}
      {action === "confirm" && observation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Edit className="h-4 w-4 text-muted-foreground" />
              Confirm / Correct
            </CardTitle>
            <CardDescription>
              Review the fields below. Edit any that need correction. A
              reason is required if you change any field. Corrected fields
              are marked as <strong>human-reported, not model-derived</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="corrected-type">Incident type</Label>
              <Select value={correctedIncidentType} onValueChange={setCorrectedIncidentType}>
                <SelectTrigger id="corrected-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["flooding", "blocked_road", "debris", "visible_structural_damage", "other", "unclear"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="corrected-severity">Preliminary severity (1–5)</Label>
              <Input
                id="corrected-severity"
                type="number"
                min={1}
                max={5}
                value={correctedSeverity}
                onChange={(e) => setCorrectedSeverity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="corrected-summary">Summary (EN)</Label>
              <Textarea
                id="corrected-summary"
                value={correctedSummary}
                onChange={(e) => setCorrectedSummary(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="corrected-summary-tl">Summary (TL draft)</Label>
              <Textarea
                id="corrected-summary-tl"
                value={correctedSummaryTl}
                onChange={(e) => setCorrectedSummaryTl(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (required if corrections made)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                placeholder="Explain why you are correcting these fields."
              />
            </div>
          </CardContent>
        </Card>
      )}

      {action && action !== "confirm" && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <Label htmlFor="action-comment">Comment / Reason</Label>
              <Textarea
                id="action-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={5000}
                placeholder={
                  action === "request_info"
                    ? "What information is missing or unclear?"
                    : action === "reject"
                    ? "Why is this report being rejected?"
                    : "Why is this report being flagged?"
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit button */}
      {action && (
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
          ) : (
            `Submit "${action === "request_info" ? "request info" : action}"`
          )}
        </Button>
      )}

      {/* Review action history (audit trail) */}
      <ReviewHistory history={history} loading={historyLoading} />
    </div>
  );
}

function ReviewHistory({ history, loading }: { history: ReviewAction[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" />
            Review History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }
  if (history.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Review History ({history.length})
        </CardTitle>
        <CardDescription>
          Append-only audit trail. Each action records the reviewer, timestamp,
          before/after status, and before/after observation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.map((h) => (
          <div key={h.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{h.action}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">· Reviewer {h.reviewer_id.slice(0, 8)}…</span>
            </div>
            {h.comment && (
              <p className="mt-1 text-xs text-muted-foreground">"{h.comment}"</p>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              {h.previous_status} → {h.new_status}
              {h.previous_severity !== null && h.new_severity !== null && (
                <> · Severity: {h.previous_severity} → {h.new_severity}</>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
