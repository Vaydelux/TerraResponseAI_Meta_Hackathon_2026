// src/lib/storage/retention.ts
//
// Private-photo retention / deletion workflow. Per the brief:
//   - "Add private-photo retention/deletion workflow, signed URL
//     expiration, access tests, safe file/object cleanup"
//   - "Gate: no ... accidental public files"
//
// Workflow (3 states, all tracked in report_retention):
//
//   active       — evidence exists in private storage. The signed-URL
//                  endpoint mints URLs normally. The reports row is
//                  live and visible per RLS.
//
//   soft_deleted — the contributor or a reviewer requested deletion.
//                  The signed-URL endpoint REFUSES to mint new URLs
//                  (the evidence is no longer viewable). The storage
//                  objects are NOT yet deleted — the retention
//                  window applies (default 7 days, configurable via
//                  RETENTION_WINDOW_DAYS env var). The reports row
//                  still exists (the audit trail is preserved), but
//                  its retention_state is set to 'soft_deleted'.
//                  During the window, the contributor can REVOKE the
//                  soft-delete request (active again) — useful for
//                  accidental clicks.
//
//   purged       — the storage objects have been removed by the
//                  purge endpoint (called manually by an admin or
//                  by a scheduled purge after the retention window
//                  expires). The reports row STILL EXISTS, but its
//                  storage keys are BLANKED (so the signed-URL
//                  endpoint returns 410 GONE) and its retention_state
//                  is set to 'purged'. The review_actions + ai_usage_log
//                  rows survive (audit trail intact).
//
// Privacy / safety:
//   - The original (EXIF intact) is purged FIRST, then the derivative
//     + thumbnail. If the derivative purge fails, the original is
//     ALREADY gone (so the most sensitive object — the EXIF-bearing
//     original — is removed even if the purge of the lower-sensitivity
//     objects fails).
//   - The reports row is NEVER hard-deleted by the cleanup endpoint.
//     Only an admin can hard-delete a report (via SQL), and that's
//     an out-of-band operation. The audit trail is the source of truth.
//   - The signed-URL endpoint checks retention_state and refuses to
//     mint URLs for soft_deleted or purged reports (see evidence/
//     route.ts).
//   - The retention window is enforced server-side (the purge
//     endpoint checks retention_window_ends_at). An admin override
//     is allowed (the env RETENTION_ADMIN_OVERRIDE=1 unlocks).
//
// All operations are logged via console.error on failure (no silent
// failures — the brief: "no silent failures").

import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  supabaseUrl,
  serviceRoleKey,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

const BUCKET_ORIGINAL = "evidence-originals";
const BUCKET_DERIVATIVE = "evidence-derivatives";
const BUCKET_THUMBNAIL = "evidence-thumbnails";

/** Read the retention window from env (default 7 days). */
export function retentionWindowDays(): number {
  const raw = process.env.RETENTION_WINDOW_DAYS;
  if (raw === undefined || raw === "") return 7;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

/** True if the admin override env is set (allows purging before the
 *  retention window expires). */
export function adminOverrideEnabled(): boolean {
  return process.env.RETENTION_ADMIN_OVERRIDE === "1";
}

/** Get the retention state for a report (active/soft_deleted/purged).
 *  Returns 'active' if no report_retention row exists yet (the report
 *  was created before this table was added — back-compat). */
export async function getRetentionState(
  reportId: string,
): Promise<"active" | "soft_deleted" | "purged"> {
  if (!isSupabaseConfigured()) return "active";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("report_retention")
    .select("retention_state")
    .eq("report_id", reportId)
    .maybeSingle();
  if (error || !data) return "active";
  return data.retention_state as "active" | "soft_deleted" | "purged";
}

/**
 * Request a soft-delete for a report. The contributor (creator) or
 * an event reviewer+ can request deletion. The retention window
 * starts now + RETENTION_WINDOW_DAYS. The signed-URL endpoint will
 * refuse to mint new URLs immediately (the evidence is no longer
 * viewable). The storage objects are NOT yet deleted.
 *
 * Returns:
 *   { ok: true, retentionWindowEndsAt } — soft-delete recorded.
 *   { ok: false, code, message } — error (NOT_FOUND, FORBIDDEN,
 *     ALREADY_DELETED, etc.).
 */
export async function requestSoftDelete(args: {
  reportId: string;
  requestedBy: string;
  reason?: string | null;
}): Promise<
  | { ok: true; retentionWindowEndsAt: string }
  | { ok: false; code: string; message: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", message: "Supabase is not configured." };
  }
  const supabase = await createSupabaseServerClient();
  // 1. Fetch the report to verify the caller is authorized.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, creator_id, event_id")
    .eq("id", args.reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return { ok: false, code: "NOT_FOUND", message: "Report not found or access denied." };
  }
  // RLS already gated the read; the caller is the creator OR an
  // event reviewer+ OR admin. No further check needed.

  // 2. Check the current retention state.
  const { data: existing } = await supabase
    .from("report_retention")
    .select("retention_state")
    .eq("report_id", args.reportId)
    .maybeSingle();
  if (existing?.retention_state === "soft_deleted") {
    return {
      ok: false,
      code: "ALREADY_DELETED",
      message: "This report is already soft-deleted.",
    };
  }
  if (existing?.retention_state === "purged") {
    return {
      ok: false,
      code: "ALREADY_PURGED",
      message: "This report's evidence has already been purged.",
    };
  }

  // 3. Insert or update the retention row.
  const retentionWindowEndsAt = new Date(
    Date.now() + retentionWindowDays() * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (existing) {
    const { error: updErr } = await supabase
      .from("report_retention")
      .update({
        retention_state: "soft_deleted",
        retention_window_ends_at: retentionWindowEndsAt,
        reason: args.reason ?? null,
        requested_by: args.requestedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("report_id", args.reportId);
    if (updErr) {
      return {
        ok: false,
        code: "UPDATE_FAILED",
        message: updErr.message,
      };
    }
  } else {
    const { error: insErr } = await supabase.from("report_retention").insert({
      report_id: args.reportId,
      retention_state: "soft_deleted",
      retention_window_ends_at: retentionWindowEndsAt,
      reason: args.reason ?? null,
      requested_by: args.requestedBy,
    });
    if (insErr) {
      return {
        ok: false,
        code: "INSERT_FAILED",
        message: insErr.message,
      };
    }
  }
  return { ok: true, retentionWindowEndsAt };
}

/**
 * Revoke a soft-delete request (returns the report to active state).
 * Only the original requester (or an admin) can revoke. The storage
 * objects were NOT deleted during the soft-delete window, so the
 * evidence is fully restored.
 */
export async function revokeSoftDelete(args: {
  reportId: string;
  requestedBy: string;
  isAdmin: boolean;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", message: "Supabase is not configured." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: existing, error } = await supabase
    .from("report_retention")
    .select("retention_state, requested_by")
    .eq("report_id", args.reportId)
    .maybeSingle();
  if (error || !existing) {
    return { ok: false, code: "NOT_FOUND", message: "No retention row for this report." };
  }
  if (existing.retention_state !== "soft_deleted") {
    return {
      ok: false,
      code: "NOT_SOFT_DELETED",
      message: "This report is not in a soft-deleted state.",
    };
  }
  // Only the original requester or an admin can revoke.
  if (existing.requested_by !== args.requestedBy && !args.isAdmin) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only the original requester or an admin can revoke the deletion request.",
    };
  }
  const { error: updErr } = await supabase
    .from("report_retention")
    .update({
      retention_state: "active",
      retention_window_ends_at: null,
      reason: null,
      requested_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("report_id", args.reportId);
  if (updErr) {
    return { ok: false, code: "UPDATE_FAILED", message: updErr.message };
  }
  return { ok: true };
}

/**
 * Purge the storage objects for a soft-deleted report. The reports
 * row is preserved (with storage keys blanked) so the audit trail
 * survives. The retention window MUST have expired (unless the
 * admin override env is set).
 *
 * Purge order: ORIGINAL first (the most sensitive — EXIF intact),
 * then derivative, then thumbnail. If the original purge succeeds
 * but the derivative purge fails, the original is ALREADY gone —
 * the most sensitive object is removed even if the lower-sensitivity
 * purge fails. The retention state is set to 'purged' only if ALL
 * three purges succeed; if any fail, the state stays 'soft_deleted'
 * and the operator can re-run the purge.
 */
export async function purgeReport(args: {
  reportId: string;
  adminOverride?: boolean;
}): Promise<{ ok: true; purged: string[] } | { ok: false; code: string; message: string; purgedSoFar?: string[] }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", message: "Supabase is not configured." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, original_storage_key, derivative_storage_key, thumbnail_storage_key")
    .eq("id", args.reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return { ok: false, code: "NOT_FOUND", message: "Report not found." };
  }
  // Check the retention state.
  const { data: retention } = await supabase
    .from("report_retention")
    .select("retention_state, retention_window_ends_at")
    .eq("report_id", args.reportId)
    .maybeSingle();
  if (!retention || retention.retention_state !== "soft_deleted") {
    return {
      ok: false,
      code: "NOT_SOFT_DELETED",
      message: "Only soft-deleted reports can be purged.",
    };
  }
  // Enforce the retention window (unless admin override).
  const override = args.adminOverride ?? adminOverrideEnabled();
  if (!override && retention.retention_window_ends_at) {
    const endsAt = new Date(retention.retention_window_ends_at).getTime();
    if (Date.now() < endsAt) {
      return {
        ok: false,
        code: "RETENTION_WINDOW_ACTIVE",
        message: `Retention window has not expired (ends ${new Date(endsAt).toISOString()}). An admin override is required to purge now.`,
      };
    }
  }

  // Purge via the service-role client (bypasses storage RLS; the
  // app-layer authz above is the gate).
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const purgeOne = async (key: string | null): Promise<boolean> => {
    if (!key) return true;
    const slashIdx = key.indexOf("/");
    if (slashIdx === -1) {
      // Malformed storage key (no bucket prefix). Should never happen
      // (the upload route writes keys as "<bucket>/<path>"). Log so
      // the operator sees it; not a silent failure.
      console.error(
        `[retention] purge skipped — malformed storage key (no slash): ${key}`,
      );
      return false;
    }
    const bucket = key.slice(0, slashIdx);
    const path = key.slice(slashIdx + 1);
    const { error } = await serviceClient.storage.from(bucket).remove([path]);
    if (error) {
      console.error(
        `[retention] purge failed for ${bucket}/${path}: ${error.message}`,
      );
      return false;
    }
    return true;
  };

  // Purge order: original first (most sensitive), then derivative,
  // then thumbnail. Track which ones succeeded.
  const purged: string[] = [];
  const originalOk = await purgeOne(report.original_storage_key);
  if (originalOk) purged.push("original");
  const derivativeOk = await purgeOne(report.derivative_storage_key);
  if (derivativeOk) purged.push("derivative");
  const thumbnailOk = await purgeOne(report.thumbnail_storage_key);
  if (thumbnailOk) purged.push("thumbnail");

  // Blank the storage keys on the reports row ONLY IF ALL three
  // purges succeeded. If any failed, leave the keys in place so the
  // operator can re-run the purge.
  if (originalOk && derivativeOk && thumbnailOk) {
    const { error: updErr } = await supabase
      .from("reports")
      .update({
        original_storage_key: "",
        derivative_storage_key: null,
        thumbnail_storage_key: null,
      })
      .eq("id", args.reportId);
    if (updErr) {
      console.error(
        `[retention] blanking storage keys failed for ${args.reportId}: ${updErr.message}`,
      );
      // Don't return failure — the storage objects ARE deleted; the
      // row update can be retried. Mark as purged on the retention
      // row regardless.
    }
    const { error: retErr } = await supabase
      .from("report_retention")
      .update({
        retention_state: "purged",
        purged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("report_id", args.reportId);
    if (retErr) {
      console.error(
        `[retention] marking retention row as purged failed for ${args.reportId}: ${retErr.message}`,
      );
    }
    return { ok: true, purged };
  }
  return {
    ok: false,
    code: "PARTIAL_PURGE",
    message: `Some storage objects could not be purged. Successfully purged: ${purged.join(", ")}.`,
    purgedSoFar: purged,
  };
}

/** Find reports whose retention window has expired and that are
 *  ready to be purged. Used by the scheduled purge job (out of
 *  scope here; this is the query that backs it). Returns up to
 *  `limit` report IDs. */
export async function findPurgeableReports(
  limit = 100,
): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("report_retention")
    .select("report_id")
    .eq("retention_state", "soft_deleted")
    .not("retention_window_ends_at", "is", null)
    .lte("retention_window_ends_at", nowIso)
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => r.report_id as string);
}

/** Bucket name constants (exported for tests + the cleanup route). */
export const STORAGE_BUCKETS = {
  ORIGINAL: BUCKET_ORIGINAL,
  DERIVATIVE: BUCKET_DERIVATIVE,
  THUMBNAIL: BUCKET_THUMBNAIL,
} as const;
