// src/app/api/reports/[id]/retention/route.ts
//
// GET /api/reports/[id]/retention — fetch the report's retention state
//   (active | soft_deleted | purged) + the retention window + the
//   reason + the requester. Used by the report detail UI to show
//   "This report's evidence was requested for deletion" + a "Revoke
//   deletion" button.
//
// POST /api/reports/[id]/retention — request a soft-delete. The
//   contributor (creator) OR an event reviewer+ can request deletion.
//   Body: { reason?: string }
//   Returns: { ok: true, retentionWindowEndsAt } | { ok: false, code }
//   Idempotent: re-requesting a soft-delete on an already-soft-deleted
//   report returns 409 ALREADY_DELETED (the UI shows the existing
//   state, no DB change).
//
// DELETE /api/reports/[id]/retention — revoke a soft-delete request
//   (returns the report to active state). Only the original requester
//   or an admin can revoke. The storage objects were NOT deleted
//   during the soft-delete window, so the evidence is fully restored.
//
// POST /api/reports/[id]/retention?purge=1 — purge the storage objects
//   for a soft-deleted report. Admin-only (or the RETENTION_ADMIN_
//   OVERRIDE env is set). The retention window MUST have expired
//   unless the admin override is set. The reports row is preserved
//   (with storage keys blanked) so the audit trail survives.
//
// Per the brief:
//   - "Add private-photo retention/deletion workflow, signed URL
//     expiration, access tests, safe file/object cleanup"
//   - "Gate: no ... accidental public files"

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  requestSoftDelete,
  revokeSoftDelete,
  purgeReport,
  adminOverrideEnabled,
} from "@/lib/storage/retention";

export async function GET(
  _request: NextRequest,
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
  // RLS gates the read — only the creator / event reviewer+ / admin
  // can see the retention row (the report_retention_select_via_report
  // policy).
  const supabase = await createSupabaseServerClient();
  const { data: ret, error } = await supabase
    .from("report_retention")
    .select("retention_state, retention_window_ends_at, reason, requested_by, purged_at, created_at, updated_at")
    .eq("report_id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: error.message } },
      { status: 500 },
    );
  }
  // No row yet = the report was created before this table existed.
  // Default: active.
  return NextResponse.json({
    ok: true,
    retention: ret ?? { retention_state: "active" },
  });
}

export async function POST(
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
  const url = new URL(request.url);
  const isPurge = url.searchParams.get("purge") === "1";

  if (isPurge) {
    // Purge is ADMIN-ONLY (the brief: "safe file/object cleanup").
    // The RETENTION_ADMIN_OVERRIDE env does NOT lower the admin
    // requirement — it only lets ADMINS bypass the retention window
    // (e.g., to purge a privacy-sensitive report immediately). The
    // RLS policy on report_retention (0004_resilience.sql) is the
    // defense-in-depth boundary: only admins can transition a
    // retention row to 'purged'. A non-admin with the env override
    // set still gets 403 here, and even if they hit the DB directly,
    // RLS would reject the update.
    if (ctx.user.role !== "admin") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an admin can purge a report's storage objects.",
          },
        },
        { status: 403 },
      );
    }
    const override = adminOverrideEnabled();
    const result = await purgeReport({
      reportId: id,
      // Admin always bypasses the retention window when the env
      // override is set; without the env, the retention window is
      // enforced even for admins (defensive default).
      adminOverride: override,
    });
    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND" ? 404 :
        result.code === "NOT_SOFT_DELETED" ? 409 :
        result.code === "RETENTION_WINDOW_ACTIVE" ? 423 :
        500;
      return NextResponse.json({ error: { code: result.code, message: result.message } }, { status });
    }
    return NextResponse.json({ ok: true, purged: result.purged });
  }

  // Soft-delete request — the contributor (creator) OR an event
  // reviewer+ can request. Parse the optional reason.
  let body: { reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine.
  }
  const reason = typeof body.reason === "string" && body.reason.length > 0
    ? body.reason.slice(0, 1000) // cap; the column is `text` (no DB limit)
    : null;

  const result = await requestSoftDelete({
    reportId: id,
    requestedBy: user.id,
    reason,
  });
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" ? 404 :
      result.code === "ALREADY_DELETED" || result.code === "ALREADY_PURGED" ? 409 :
      500;
    return NextResponse.json({ error: { code: result.code, message: result.message } }, { status });
  }
  return NextResponse.json({ ok: true, retentionWindowEndsAt: result.retentionWindowEndsAt });
}

export async function DELETE(
  _request: NextRequest,
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
  const result = await revokeSoftDelete({
    reportId: id,
    requestedBy: user.id,
    isAdmin: ctx.user.role === "admin",
  });
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" ? 404 :
      result.code === "FORBIDDEN" ? 403 :
      result.code === "NOT_SOFT_DELETED" ? 409 :
      500;
    return NextResponse.json({ error: { code: result.code, message: result.message } }, { status });
  }
  return NextResponse.json({ ok: true });
}
