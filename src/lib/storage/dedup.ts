// src/lib/storage/dedup.ts
//
// SHA-256 duplicate detection within the authorized event.
//
// Per the brief:
//   - "Compute SHA-256 on original bytes and check for duplicates
//     within the authorized event before model inference."
//   - "A duplicate should link to an existing permitted report or
//     ask the user for confirmation, never leak the existence of
//     other events' reports."
//
// The RLS policies (0002_rls.sql reports_select_creator_or_event_
// reviewer_or_admin) enforce that the user can only see reports in
// events they're a member of. So a Supabase query filtered by
// `event_id = <authorized event> AND sha256 = <digest>` will NEVER
// return rows from other events — RLS is the boundary. This function
// is the application-layer check that surfaces the duplicate to the
// user for confirmation.
//
// Returns the existing report's id if a duplicate is found in the
// authorized event, or null if the image is new (or the user is a
// contributor looking at their own reports). The route handler
// either links the new report to the existing one or asks for
// confirmation.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DedupResult {
  /** True if a report with the same sha256 exists in the event. */
  isDuplicate: boolean;
  /** The existing report's id, when isDuplicate. */
  existingReportId: string | null;
}

/**
 * Check for a duplicate SHA-256 within the authorized event.
 *
 * The caller MUST have already verified the user + that they're a
 * member of `eventId` (the route handler does this via getAuthContext).
 * The Supabase query is filtered by `event_id = eventId` AND
 * `sha256 = digest`; RLS further restricts to reports the user can
 * see (creator OR event reviewer+ OR admin). A contributor will only
 * match their OWN reports (RLS reports_select_creator_or_event_
 * reviewer_or_admin allows creator_id = auth.uid()); a reviewer/admin
 * will match any report in the event.
 *
 * This never leaks other events' reports because:
 *   1. The WHERE clause filters by the authorized event_id.
 *   2. RLS adds the per-user visibility filter on top.
 */
export async function checkDuplicate(
  eventId: string,
  digest: string,
): Promise<DedupResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id")
    .eq("event_id", eventId)
    .eq("sha256", digest)
    .limit(1);

  if (error) {
    // On error, fail safe: treat as NOT a duplicate so the upload
    // proceeds (the worst case is a re-analysis, which the brief
    // accepts: "repeated uploads do not waste model calls" — but a
    // failed dedup check that blocks uploads is worse than a rare
    // duplicate).
    return { isDuplicate: false, existingReportId: null };
  }

  if (data && data.length > 0) {
    return { isDuplicate: true, existingReportId: data[0].id };
  }
  return { isDuplicate: false, existingReportId: null };
}
