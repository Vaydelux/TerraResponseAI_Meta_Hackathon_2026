// src/app/api/reports/route.ts
//
// POST /api/reports — photo submission endpoint.
//
// Server-side enforcement order (per the brief: "Upload only after
// server identity/event authorization checks"):
//   1. Identity verification: requireServerUser() → supabase.auth.getUser
//      (JWT signature verified, not cookie presence).
//   2. Event authorization: getAuthContext(user) → RLS-enforced profile
//      + event memberships. The user MUST be a contributor+ of the
//      event they're uploading to.
//   3. Input validation: Zod on the JSON metadata.
//   4. File validation: validateImageFile → size limit + magic bytes
//      + Sharp decode (never trust client MIME).
//   5. SHA-256 + dedup: check for a duplicate within the authorized
//      event. If found, return 409 with the existing report id (the
//      client asks for confirmation or links).
//   6. Store: original → private bucket (EXIF intact); derivative +
//      thumbnail → private buckets (EXIF stripped). Rollback on any
//      failure.
//   7. Insert the reports row (after storage succeeds; clean up
//      storage if the insert fails).
//
// The original is NEVER publicly exposed (private bucket; the server
// mints short-lived signed URLs at read time — see supabase/README §6).
//
// Per the brief's gate: "valid images save privately; oversize,
// disguised invalid, and unauthorized files are rejected; repeated
// uploads do not waste model calls."

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { reportUploadMetaSchema } from "@/lib/api-schemas/reports";
import {
  validateImageFile,
  describeValidationError,
  type AllowedImageType,
} from "@/lib/storage/image-validate";
import { sha256Hex } from "@/lib/storage/sha256";
import { readExif } from "@/lib/storage/exif";
import { makeDerivatives } from "@/lib/storage/derivative";
import { checkDuplicate } from "@/lib/storage/dedup";
import { storeEvidence, deleteEvidence } from "@/lib/storage/private-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUserUploadRate } from "@/lib/rate-limit";
import { sanitizeUserText } from "@/lib/ai/prompt-injection";
import { resolveLocation, validateBounds } from "@/lib/storage/missing-location";

// MIME → file extension for the storage path.
const EXT_BY_TYPE: Record<AllowedImageType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  // 0. Supabase must be configured for any of this to work.
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }

  // 1. Identity verification (server-side, JWT signature checked).
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  // 2. Event authorization (RLS-enforced profile + memberships).
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }

  // 3. Parse multipart. The client sends `file` (the image) + `meta`
  //    (a JSON string with the schema fields).
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Expected multipart/form-data." } },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Missing 'file' field." } },
      { status: 400 },
    );
  }

  const metaRaw = form.get("meta");
  let meta;
  try {
    const parsed = JSON.parse(String(metaRaw ?? "{}"));
    meta = reportUploadMetaSchema.parse(parsed);
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid metadata." } },
      { status: 400 },
    );
  }

  // 4. Event authorization — the user must be a member (contributor+)
  //    of meta.eventId.
  const membership = ctx.events.find((e) => e.event_id === meta.eventId);
  if (!membership) {
    // The user is NOT a member of this event. We return 403 WITHOUT
    // confirming whether the event exists (no cross-event leak).
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You are not a member of this event." } },
      { status: 403 },
    );
  }
  if (membership.role !== "contributor" && membership.role !== "reviewer" && membership.role !== "coordinator") {
    // Defensive: the membership types are contributor/reviewer/coordinator;
    // all three can submit reports (the RLS reports_insert_contributor_self
    // policy allows contributor+). This check is belt-and-suspenders.
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Your event role cannot submit reports." } },
      { status: 403 },
    );
  }

  // 4b. Per-user upload rate limit (UPLOAD_RATE_LIMIT_PER_HOUR, default
  //     20). The brief: "Per-user and per-event server-enforced rate
  //     limits." Returns 429 on exceed (the client should NOT retry
  //     for an hour — the window is rolling).
  const uploadRate = await checkUserUploadRate(user.id);
  if (!uploadRate.ok) {
    return NextResponse.json(
      { error: { code: uploadRate.code, message: uploadRate.message, used: uploadRate.used, limit: uploadRate.limit } },
      { status: 429 },
    );
  }

  // 5. Read the file bytes. File is a Web File/Blob; .arrayBuffer() works.
  const buf = new Uint8Array(await file.arrayBuffer());

  // 6. File validation: size + magic bytes + Sharp decode.
  const validation = await validateImageFile(buf, file.type);
  if (!validation.ok || !validation.detectedType) {
    const err = validation.error!;
    return NextResponse.json(
      {
        error: {
          code: err.code.toUpperCase(),
          message: describeValidationError(err),
          // For too_large, include the limit so the client can show it.
          ...(err.code === "too_large" ? { limitBytes: err.limitBytes } : {}),
        },
      },
      { status: err.code === "too_large" ? 413 : err.code === "wrong_type" || err.code === "decode_failed" ? 415 : 400 },
    );
  }
  const detectedType = validation.detectedType;

  // 7. SHA-256 on the original bytes.
  const digest = sha256Hex(buf);

  // 8. Dedup check within the authorized event.
  const dup = await checkDuplicate(meta.eventId, digest);
  if (dup.isDuplicate && dup.existingReportId) {
    // If the client asked to link (meta.linkToReportId === the existing
    // id), we'd allow it — but linking is a Phase 4 affordance. For now,
    // return 409 + the existing id so the client can ask for
    // confirmation. Repeated uploads do NOT waste model calls because
    // we stop here (no storage, no AI).
    if (meta.linkToReportId === dup.existingReportId) {
      // The client confirmed the duplicate; link (Phase 4). For now,
      // return 200 with the existing report id.
      return NextResponse.json({
        ok: true,
        linkedTo: dup.existingReportId,
        message: "Linked to existing report.",
      });
    }
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE",
          message: "This image has already been submitted to this event.",
          existingReportId: dup.existingReportId,
        },
      },
      { status: 409 },
    );
  }

  // 9. EXIF extraction (GPS + capture timestamp).
  const exif = await readExif(buf);

  // 10. Make the derivative + thumbnail (EXIF stripped, re-encoded).
  let derivatives;
  try {
    derivatives = await makeDerivatives(buf);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "PROCESSING_FAILED",
          message: "Could not process the image.",
          detail: err instanceof Error ? err.message : "Unknown",
        },
      },
      { status: 422 },
    );
  }

  // 11. Generate a report id (the storage path uses it before the row
  //     exists; the row insert uses the same id).
  const reportId = crypto.randomUUID();
  const ext = EXT_BY_TYPE[detectedType];

  // 12. Store original + derivative + thumbnail in private buckets.
  //     Rollback on any failure.
  let keys;
  try {
    keys = await storeEvidence({
      eventId: meta.eventId,
      reportId,
      original: buf,
      derivative: derivatives.derivative,
      thumbnail: derivatives.thumbnail,
      ext,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "STORAGE_FAILED",
          message: "Could not store the evidence. Partial uploads were rolled back.",
          detail: err instanceof Error ? err.message : "Unknown",
        },
      },
      { status: 500 },
    );
  }

  // 13. Insert the reports row. If this fails, delete the storage
  //     objects (resilient rollback).
  const supabase = await createSupabaseServerClient();
  // Resolve the location: user input takes precedence over EXIF;
  // when both are missing, the report is stored with location_source
  // = "unknown" and null coords. The server NEVER fabricates
  // coordinates (the brief: "safe handling of missing locations").
  // The pure resolver is unit-tested in missing-location.test.ts.
  const resolved = resolveLocation({
    userSource: meta.locationSource ?? null,
    userLat: meta.latitude ?? null,
    userLng: meta.longitude ?? null,
    exifLat: exif.latitude,
    exifLng: exif.longitude,
  });
  // Validate coordinate bounds (rejects NaN explicitly).
  const boundsError = validateBounds(resolved.latitude, resolved.longitude);
  if (boundsError) {
    // Rollback the storage upload before returning.
    await deleteEvidence(keys);
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: boundsError } },
      { status: 400 },
    );
  }

  // Sanitize user-supplied title + description against prompt-injection
  // patterns BEFORE storing. Per the brief: "input validation against
  // prompt injection in user captions." Defense-in-depth: the user
  // text is NEVER sent to the model (the system prompt is fixed; the
  // only image input is the derivative), but we sanitize anyway so
  // the stored text can't be confused with a system instruction by
  // any downstream consumer (reviewer UI, audit log). Detected
  // patterns are rewritten to "[redacted:possible-instruction]".
  const titleSanitized = meta.title ? sanitizeUserText(meta.title) : null;
  const descriptionSanitized = meta.description ? sanitizeUserText(meta.description) : null;
  if (titleSanitized?.rewrote || descriptionSanitized?.rewrote) {
    console.warn(
      `[upload] prompt-injection pattern detected + sanitized: ` +
        `title=${titleSanitized?.matchedPatterns ?? []} ` +
        `description=${descriptionSanitized?.matchedPatterns ?? []}`,
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("reports")
    .insert({
      id: reportId,
      event_id: meta.eventId,
      creator_id: user.id,
      status: "uploaded",
      title: titleSanitized?.text ?? null,
      description: descriptionSanitized?.text ?? null,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      location_source: resolved.source,
      location_label: meta.locationLabel,
      original_storage_key: keys.originalStorageKey,
      derivative_storage_key: keys.derivativeStorageKey,
      thumbnail_storage_key: keys.thumbnailStorageKey,
      sha256: digest,
      image_mime_type: detectedType,
      image_bytes: buf.byteLength,
      image_width: derivatives.derivativeWidth,
      image_height: derivatives.derivativeHeight,
      captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null,
      uploaded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Rollback the storage upload.
    await deleteEvidence(keys);
    return NextResponse.json(
      {
        error: {
          code: "INSERT_FAILED",
          message: "Could not create the report. Storage objects were cleaned up.",
          detail: insertErr?.message ?? "Unknown",
        },
      },
      { status: 500 },
    );
  }

  // 14. Success. Return the report id + the extracted EXIF so the
  //     client can show a location-confirmation step.
  return NextResponse.json(
    {
      ok: true,
      reportId: inserted.id,
      detectedType,
      sha256: digest,
      exif: {
        latitude: exif.latitude,
        longitude: exif.longitude,
        capturedAt: exif.capturedAt,
      },
      locationSource: resolved.source,
    },
    { status: 201 },
  );
}

/**
 * GET /api/reports — list reports the user is authorized to see
 * (RLS-enforced). Supports filtering by event_id, status, and
 * locationSource. The `unlocated=true` filter returns only
 * location_source = 'unknown' reports (the "Unlocated list/queue"
 * the brief requires — these never appear on the map). The
 * `include_analysis=true` flag adds a nested select on
 * report_analyses(structured_observation) so the map view can
 * filter by incident_type; other consumers omit it to avoid the
 * JOIN cost.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  // Identity verification (server-side).
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

  // Parse query params. event_id is optional but recommended — the
  // RLS policies will filter by membership anyway.
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const unlocated = url.searchParams.get("unlocated") === "true";
  const onMap = url.searchParams.get("onMap") === "true";
  // include_analysis=true → also return the AI's structured_observation
  // (incident_type etc.) via a nested select on report_analyses. The map
  // view uses this for the incident-type filter. Other consumers
  // (dashboard, list) don't pay the JOIN cost when they don't need it.
  const includeAnalysis = url.searchParams.get("include_analysis") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  // Event membership check (defense-in-depth — RLS already filters).
  if (eventId) {
    const membership = ctx.events.find((e) => e.event_id === eventId);
    if (!membership) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "You are not a member of this event." } },
        { status: 403 },
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  // Base column list — every consumer reads these. The nested
  // report_analyses select is added only when include_analysis=true so
  // the dashboard's 6 parallel fetches don't pay the JOIN cost.
  const baseSelect =
    "id, event_id, creator_id, status, review_outcome, title, description, latitude, longitude, location_source, location_label, sha256, image_mime_type, image_bytes, captured_at, uploaded_at, priority_score, created_at";
  const selectClause = includeAnalysis
    ? `${baseSelect}, report_analyses(structured_observation)`
    : baseSelect;
  let query = supabase
    .from("reports")
    .select(selectClause)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventId) query = query.eq("event_id", eventId);
  if (status) query = query.eq("status", status);
  if (unlocated) query = query.eq("location_source", "unknown");
  // onMap=true returns only reports that SHOULD appear on the map:
  // reviewed + confirmed/flagged/resolved + NOT unknown location.
  // This enforces the gate: "unlocated reports stay off the map."
  if (onMap) {
    query = query
      .eq("status", "reviewed")
      .in("review_outcome", ["confirmed", "flagged", "resolved"])
      .neq("location_source", "unknown");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reports: data ?? [] });
}
