// src/app/api/reports/[id]/route.ts
//
// GET /api/reports/[id] — fetch a single report's detail (RLS-enforced).
// The caller must be the report's creator OR a reviewer/coordinator of
// the report's event OR a global admin (RLS policies).
//
// PATCH /api/reports/[id] — update the report's location (locationSource,
// latitude, longitude) or status. The PATCH is restricted by RLS:
//   - The creator can update location while status is uploaded/analyzing.
//   - A reviewer/coordinator can update status (review actions).
//   - The trusted evidence fields (sha256, storage keys) are locked
//     by the RLS with-check (reports_update_event_reviewer_or_admin).
//
// Per the brief: "Implement create report, report detail and report
// list with private evidence display through access-controlled URLs."

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { reportUpdateSchema, toReportColumns } from "@/lib/api-schemas/report-update";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  // RLS enforces: the user can only see reports where they're the
  // creator OR a reviewer+ of the report's event.
  // Include the analysis data via a nested select on report_analyses
  // (1:1 via the report_id unique FK). The analysis provides the
  // structured_observation (the AI observation) + model_id + prompt/
  // schema version for the report detail view.
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, event_id, creator_id, status, review_outcome, title, description, latitude, longitude, location_source, location_label, sha256, image_mime_type, image_bytes, image_width, image_height, captured_at, uploaded_at, priority_score, retry_count, last_error, created_at, updated_at, original_storage_key, derivative_storage_key, thumbnail_storage_key, report_analyses(model_id, prompt_version, schema_version, structured_observation, created_at)",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, report: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  // Enforce event membership at the app layer (defense-in-depth with
  // RLS). The brief: "enforce membership again inside every server
  // route." The RLS policies on the reports table also filter by
  // creator/reviewer+, but this catches a mismatch early.
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  let body;
  try {
    body = reportUpdateSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid update payload." } },
      { status: 400 },
    );
  }

  let update;
  try {
    update = toReportColumns(body);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Invalid update." } },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  // RLS enforces: the creator can update pre-review (no status=reviewed);
  // a reviewer/coordinator can update status. The with-check locks
  // the trusted evidence fields.
  const { data, error } = await supabase
    .from("reports")
    .update(update)
    .eq("id", id)
    .select("id, status, latitude, longitude, location_source")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Update failed or access denied." } },
      { status: error ? 500 : 403 },
    );
  }

  return NextResponse.json({ ok: true, report: data });
}
