/** Pure, deterministic display priority for the human review queue.
 * NOT an authorization decision or an automatic disaster confirmation.
 */
export type TriageQueueClass =
  | "critical_provisional" | "high_review" | "moderate_review"
  | "low_review" | "unrelated_review" | "uncertain_review";

export type QueueTriageInput = {
  priority_score: number | null;
  uploaded_at: string;
  report_triage?: {
    triage_class?: TriageQueueClass;
    verification_status?: string;
    preliminary_severity?: number | null;
  } | null;
};

const TRIAGE_ORDER: Record<TriageQueueClass, number> = {
  critical_provisional: 6,
  high_review: 5,
  moderate_review: 4,
  uncertain_review: 3,
  low_review: 2,
  unrelated_review: 1,
};

const TRIAGE_LABEL: Record<TriageQueueClass, string> = {
  critical_provisional: "Critical · AI-assessed",
  high_review: "High · Escalate",
  moderate_review: "Moderate · Review",
  uncertain_review: "Uncertain · Review",
  low_review: "Low · Review",
  unrelated_review: "Potentially unrelated",
};

export function triageLabel(row: QueueTriageInput): string {
  const type = row.report_triage?.triage_class;
  return type && Object.hasOwn(TRIAGE_LABEL, type) ? TRIAGE_LABEL[type] : "Awaiting triage";
}

export function rankQueue<Row extends QueueTriageInput>(rows: Row[]): Row[] {
  // Critical AI findings jump to the top of the moderation inbox,
  // but remain unverified regardless of their priority.
  return [...rows].sort((a, b) => {
    const ta = a.report_triage?.triage_class;
    const tb = b.report_triage?.triage_class;
    const pa = ta && Object.hasOwn(TRIAGE_ORDER, ta) ? TRIAGE_ORDER[ta] : 0;
    const pb = tb && Object.hasOwn(TRIAGE_ORDER, tb) ? TRIAGE_ORDER[tb] : 0;
    if (pa !== pb) return pb - pa;
    const scoreA = Number.isFinite(a.priority_score) ? (a.priority_score ?? 0) : 0;
    const scoreB = Number.isFinite(b.priority_score) ? (b.priority_score ?? 0) : 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const timeA = Date.parse(a.uploaded_at);
    const timeB = Date.parse(b.uploaded_at);
    return (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0);
  });
}
