import "server-only";

import { cookies } from "next/headers";
import type { AuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  filterWorkspaceReports,
  type IncidentWorkspaceSnapshot,
  type WorkspaceReport,
} from "./incidents";

const REPORT_LIMIT = 200;
const REPORT_STATUSES = new Set([
  "uploaded", "analyzing", "needs_review", "needs_manual_review", "reviewed", "retryable_error",
]);
const REVIEW_OUTCOMES = new Set(["confirmed", "flagged", "resolved", "rejected"]);
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value : null;
}

function timestamp(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const time = Date.parse(valueText);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function latestAnalysis(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return record(value);
  const entries = value.filter((entry): entry is Record<string, unknown> => record(entry) !== null);
  // The live schema is one-to-one. If an older source returns several runs,
  // use persisted timestamps and a stable ID tie-breaker, never array position.
  const newestTime = (entry: Record<string, unknown>) => Math.max(
    ...[entry.updated_at, entry.completed_at, entry.created_at].map((date) => {
      const parsed = timestamp(date);
      return parsed ? Date.parse(parsed) : -Infinity;
    }),
  );
  if (entries.length > 1 && entries.every((entry) => !Number.isFinite(newestTime(entry)))) return null;
  return entries.sort((a, b) => {
    const aTime = newestTime(a);
    const bTime = newestTime(b);
    if (aTime !== bTime) return aTime > bTime ? -1 : 1;
    return (text(a.id) ?? "").localeCompare(text(b.id) ?? "");
  })[0] ?? null;
}

function normalizeReport(input: unknown): WorkspaceReport | null {
  const row = record(input);
  if (!row || typeof row.id !== "string" || !REPORT_ID.test(row.id) ||
      typeof row.status !== "string" || !REPORT_STATUSES.has(row.status) ||
      row.retention_state !== "active" || row.review_outcome === "rejected") return null;
  const reviewOutcome = text(row.review_outcome);
  if ((row.status === "reviewed" && (!reviewOutcome || !REVIEW_OUTCOMES.has(reviewOutcome))) ||
      (row.status !== "reviewed" && reviewOutcome !== null)) return null;
  const analysis = latestAnalysis(row.report_analyses);
  const observation = analysis?.processing_status === "succeeded"
    ? record(analysis.structured_observation) : null;
  const severity = numberInRange(observation?.preliminary_severity, 1, 5);
  const source = row.location_source === "gps" || row.location_source === "manual"
    ? row.location_source : "unknown";
  const latitude = numberInRange(row.latitude, -90, 90);
  const longitude = numberInRange(row.longitude, -180, 180);
  const validCoordinates = source !== "unknown" && latitude !== null && longitude !== null;
  return {
    id: row.id,
    status: row.status,
    review_outcome: reviewOutcome,
    title: text(row.title),
    description: text(row.description),
    location_source: source,
    location_label: text(row.location_label),
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
    uploaded_at: timestamp(row.uploaded_at) ?? "",
    captured_at: timestamp(row.captured_at),
    priority_score: numberInRange(row.priority_score, 0, 100),
    incident_type: text(observation?.incident_type),
    severity: severity !== null && Number.isInteger(severity) ? severity : null,
    summary: text(observation?.summary_en),
    model_id: observation ? text(analysis?.model_id) : null,
    retention_state: "active",
  };
}

/** Called only after server identity/profile verification; the request client keeps RLS active. */
export async function loadIncidentWorkspaceSnapshot(
  ctx: Pick<AuthContext, "events">,
): Promise<IncidentWorkspaceSnapshot> {
  const selectedEventId = (await cookies()).get("tr-active-event")?.value;
  const event = ctx.events.find((item) => item.event_id === selectedEventId) ??
    ctx.events.find((item) => item.event_slug === "community-intake") ?? ctx.events[0];
  const base = {
    eventId: event?.event_id ?? "",
    eventName: event?.event_name ?? "Reporting workspace",
    fetchedAt: new Date().toISOString(),
  };
  if (!event) {
    return { ...base, reports: [], totalCount: null, state: "unavailable",
      message: "Your account has no available reporting workspace. You can still try submitting a report." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error, count } = await supabase.from("reports")
      .select(
        "id, title, description, status, review_outcome, location_source, location_label, latitude, longitude, uploaded_at, captured_at, priority_score, retention_state, report_analyses(id, model_id, processing_status, created_at, updated_at, completed_at, structured_observation)",
        { count: "exact" },
      )
      .eq("event_id", event.event_id)
      .eq("retention_state", "active")
      .or("review_outcome.is.null,review_outcome.neq.rejected")
      .order("priority_score", { ascending: false, nullsFirst: false })
      .order("uploaded_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, REPORT_LIMIT - 1);

    if (error || !Array.isArray(data)) {
      return { ...base, fetchedAt: new Date().toISOString(), reports: [], totalCount: null,
        state: "unavailable", message: "Incident data is temporarily unavailable. Refresh to try again." };
    }

    const normalized = data.map(normalizeReport).filter((row): row is WorkspaceReport => row !== null);
    const reports = filterWorkspaceReports(normalized, {
      hazard: "all", query: "", cutoff: null, sort: "priority",
    });
    const totalCount = typeof count === "number" && Number.isInteger(count) && count >= 0
      ? count : null;
    const hasUnavailableRows = normalized.length !== data.length;
    const windowLimited = totalCount !== null && totalCount > data.length;
    const messages: string[] = [];
    if (totalCount === null) messages.push("The total report count is unavailable.");
    if (windowLimited) {
      messages.push(`Showing ${reports.length} loaded reports of ${totalCount}. Filters apply to this loaded window.`);
    }
    if (hasUnavailableRows) messages.push("Some report records are unavailable.");
    return { ...base, fetchedAt: new Date().toISOString(), reports, totalCount, windowLimited,
      state: totalCount === null || hasUnavailableRows ? "partial" : "ready",
      ...(messages.length ? { message: messages.join(" ") } : {}),
    };
  } catch {
    return { ...base, fetchedAt: new Date().toISOString(), reports: [], totalCount: null,
      state: "unavailable", message: "Incident data is temporarily unavailable. Refresh to try again." };
  }
}
