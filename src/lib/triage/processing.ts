// Server-side entry point: only imported by Next.js server routes/components.
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import type { Observation } from "@/lib/ai/observation-schema";
import { decideTriage, TRIAGE_POLICY_VERSION } from "./policy";
import { readPersistedTriage } from "./persisted-snapshot";

export function isTriageEnabled(): boolean {
  return process.env.REPORT_FIRST_TRIAGE_ENABLED === "true";
}

function serviceDatabase() {
  const url = supabaseUrl(), key = serviceRoleKey();
  if (!url || !key) throw new Error("Triage database not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Database = ReturnType<typeof serviceDatabase>;
type NotificationKind =
  | "report_submitted" | "triage_completed" | "critical_provisional"
  | "review_required" | "review_completed" | "incident_grouped" | "role_changed";

async function notifyRecipients(
  db: Database,
  args: { eventId: string; reportId: string; kind: NotificationKind; title: string; body: string },
) {
  // All admins see the transaction. Event reviewers also receive the
  // moderation queue notification, but no user-provided text or image.
  const { data: admins, error: adminsError } = await db.from("profiles").select("id").eq("role", "admin");
  if (adminsError) throw new Error("Cannot resolve admin notification recipients.");
  const recipientIds = new Set((admins ?? []).map(x => x.id as string));
  if (args.kind === "review_required") {
    const { data: reviewers, error } = await db
      .from("event_members").select("user_id").eq("event_id", args.eventId).eq("role", "reviewer");
    if (error) throw new Error("Cannot resolve reviewer notification recipients.");
    for (const user of reviewers ?? []) recipientIds.add(user.user_id as string);
  }
  if (recipientIds.size === 0) return;
  // Retries are idempotent; no duplicate notification for the same
  // recipient, report and notification kind.
  const { data: existing, error: existingError } = await db.from("notifications")
    .select("recipient_id").eq("report_id", args.reportId).eq("kind", args.kind);
  if (existingError) throw new Error("Cannot verify notification delivery.");
  const notified = new Set((existing ?? []).map(x => x.recipient_id as string));
  const next = [...recipientIds].filter(id => !notified.has(id)).map(id => ({
    recipient_id: id,
    report_id: args.reportId,
    event_id: args.eventId,
    kind: args.kind,
    title: args.title,
    body: args.body,
  }));
  if (next.length) {
    // Unique (recipient_id,report_id,kind) prevents two workers from
    // creating duplicate notifications under concurrent retries.
    // ignoreDuplicates preserves successful delivery for every
    // recipient even if another worker already inserted one row.
    const { error } = await db.from("notifications").upsert(next, {
      onConflict: "recipient_id,report_id,kind", ignoreDuplicates: true,
    });
    if (error) throw new Error("Could not queue admin notifications.");
  }
}

/** An audit-backed admin inbox event for a completed human review. */
export async function notifyReviewCompleted(reportId: string, eventId: string, action: string) {
  if (!isTriageEnabled()) return;
  const allowed = new Set(["confirm", "flag", "reject", "resolve", "request_info", "correct", "comment"]);
  if (!allowed.has(action)) throw new Error("Unrecognized review action");
  await notifyRecipients(serviceDatabase(), {
    reportId, eventId, kind: "review_completed",
    title: "Human review completed",
    body: "An authorized reviewer performed: " + action.replaceAll("_", " ") + ".",
  });
}

/** Notifications are durable and server-only, not browser event callbacks. */
export async function notifyReportSubmitted(reportId: string, eventId: string) {
  if (!isTriageEnabled()) return;
  await notifyRecipients(serviceDatabase(), {
    reportId, eventId, kind: "report_submitted",
    title: "New community report", body: "A community member submitted evidence for AI triage.",
  });
}

/**
 * Post-inference processing. Separate from the Meta model call; no
 * inference is invented if it is unavailable. Repeated calls may
 * complete a previously interrupted partial write.
 */
export async function processReportTriage(args: {
  reportId: string;
  eventId: string;
  modelId: string;
  observation: Observation;
}) {
  if (!isTriageEnabled()) return null;
  const db = serviceDatabase();
  const { data: report, error: readError } = await db.from("reports")
    .select("id,event_id,latitude,longitude,location_source,status")
    .eq("id", args.reportId).eq("event_id", args.eventId).single();
  if (readError || !report) throw new Error("Cannot retrieve report for triage.");
  if (!["needs_review","reviewed"].includes(report.status)) {
    throw new Error("Report cannot be triaged in its current state.");
  }
  const hasLocation = report.location_source !== "unknown" &&
    Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
  // No automatic publication in normal environments or demo/mock inference.
  // A published state is always provisional and is additionally checked
  // by a database trigger. No private evidence URL is exposed here.
  const authenticInference = !/(?:demo|mock|stub|test)/i.test(args.modelId) &&
    args.modelId.trim().length > 0 && process.env.DEMO_MODE !== "true";
  const publicationEnabled = process.env.REPORT_FIRST_CRITICAL_PUBLICATION_ENABLED === "true" &&
    authenticInference;
  const decision = decideTriage(args.observation, hasLocation, publicationEnabled);
  // INSERT ... ON CONFLICT DO NOTHING: a second worker or a retry must
  // never overwrite the first classification or an intervening human review.
  const { error: insertError } = await db.from("report_triage").upsert({
    report_id: args.reportId,
    incident_type: args.observation.incident_type,
    preliminary_severity: args.observation.preliminary_severity,
    triage_class: decision.triageClass,
    reason_code: decision.reasonCode,
    triage_policy_version: TRIAGE_POLICY_VERSION,
    verification_status: decision.verificationStatus,
    publication_status: decision.publicationStatus,
    model_id: args.modelId,
  }, { onConflict: "report_id", ignoreDuplicates: true });
  if (insertError) throw new Error("Cannot persist AI triage.");

  // Always read back the committed row, including after a concurrent insert.
  // The caller's latest inferred observation is not authoritative on retry.
  const { data: persisted, error: lookupError } = await db.from("report_triage")
    .select("incident_type,triage_class,verification_status,publication_status,reason_code,triage_policy_version")
    .eq("report_id", args.reportId).single();
  if (lookupError || !persisted) throw new Error("Cannot read saved triage.");
  const stored = readPersistedTriage(persisted);

  // Thread resolution: same hazard + event + bounded recency +
  // nearby PostGIS candidates. The association is always "suggested"
  // until human verification, never a proven duplicate.
  const { data: link, error: linkReadError } = await db.from("incident_report_links")
    .select("incident_id").eq("report_id", args.reportId).maybeSingle();
  if (linkReadError) throw new Error("Cannot check incident thread association.");
  if (!link) {
    let incidentId: string | null = null;
    let distanceM: number | null = null;
    if (hasLocation && !["other", "unclear"].includes(stored.incidentType)) {
      const radius = stored.incidentType === "flooding" ? 10000 : 5000;
      const { data: candidates, error: candidateError } = await db.rpc(
        "find_community_incident_candidates", {
          p_event_id: args.eventId, p_type: stored.incidentType,
          p_lat: report.latitude, p_lon: report.longitude, p_radius_m: radius,
        },
      );
      if (candidateError) throw new Error("Cannot query near-duplicate incident threads.");
      if (candidates?.length) {
        incidentId = candidates[0].incident_id as string;
        distanceM = Math.round(Number(candidates[0].distance_m));
      }
    }
    if (!incidentId) {
      const { data: newThread, error: threadError } = await db.from("incident_threads")
        .insert({
          event_id: args.eventId,
          incident_type: stored.incidentType,
          title: "Possible " + stored.incidentType.replaceAll("_", " "),
          latitude: hasLocation ? report.latitude : null,
          longitude: hasLocation ? report.longitude : null,
        }).select("id").single();
      if (threadError || !newThread) throw new Error("Could not create incident thread.");
      incidentId = newThread.id as string;
    }
    const { error: associateError } = await db.from("incident_report_links").insert({
      report_id: args.reportId,
      incident_id: incidentId,
      assignment_method: distanceM !== null ? "suggested" : "automatic",
      confirmed_match: false,
      distance_m: distanceM,
    });
    if (associateError && associateError.code !== "23505") {
      throw new Error("Could not associate incident evidence.");
    }
  }

  // After a human review, retries must not resurrect an actionable
  // AI review notification or change the final verification state.
  if (stored.verificationStatus === "awaiting_human") {
    await notifyRecipients(db, {
      reportId: args.reportId, eventId: args.eventId,
      kind: stored.priority === "critical" ? "critical_provisional"
        : stored.priority === "high" ? "triage_completed" : "review_required",
      title: stored.priority === "critical" ? "Urgent provisional disaster observation" :
        stored.priority === "high" ? "High-priority observation requires review" :
        "New report requires moderation",
      body: "AI triage: " + stored.triageClass.replaceAll("_", " ") +
        ". Not human-confirmed. Open the review workbench.",
    });
  }
  return stored;
}
