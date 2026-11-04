import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { notifyReportSubmitted } from "@/lib/triage/processing";
import { ensureCommunityIntakeMembership } from "@/lib/community/intake";
import { reportUploadMetaSchema } from "@/lib/api-schemas/reports";
import { validateImageFile, describeValidationError } from "@/lib/storage/image-validate";
import { sha256Hex } from "@/lib/storage/sha256";
import { readExif } from "@/lib/storage/exif";
import { makeDerivatives } from "@/lib/storage/derivative";
import { checkDuplicate } from "@/lib/storage/dedup";
import { resolveLocation, validateBounds } from "@/lib/storage/missing-location";
import { deleteEvidence, downloadPrivateObject, storeDerivedEvidence, BUCKET_ORIGINAL } from "@/lib/storage/private-store";
import { verifyDirectUploadGrant } from "@/lib/upload/direct-upload-token";
import { sanitizeUserText } from "@/lib/ai/prompt-injection";
import { isSupabaseConfigured, serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";

function serviceDb() { return createClient(supabaseUrl(), serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } }); }

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } }, { status: 503 });
  let user;
  try { user = await requireServerUser(); } catch { return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 }); }
  if (!await getAuthContext(user)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Profile not found." } }, { status: 401 });
  let body: { grant?: string; meta?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid finalize payload." } }, { status: 400 }); }
  const grant = body.grant ? verifyDirectUploadGrant(body.grant) : null;
  if (!grant || grant.userId !== user.id || grant.path !== `${grant.eventId}/${grant.reportId}.jpg`) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Upload grant is invalid or expired." } }, { status: 403 });
  let eventId: string;
  try { eventId = await ensureCommunityIntakeMembership(user.id); } catch { return NextResponse.json({ error: { code: "INTAKE_UNAVAILABLE", message: "Photo reporting is temporarily unavailable." } }, { status: 503 }); }
  if (eventId !== grant.eventId) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Upload grant no longer matches the authorized intake." } }, { status: 403 });
  let meta;
  try { meta = reportUploadMetaSchema.parse(body.meta ?? {}); } catch { return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid metadata." } }, { status: 400 }); }
  const originalPath = grant.path;
  let committed = false;
  let derivedKeys: { derivativeStorageKey: string; thumbnailStorageKey: string } | null = null;
  try {
    const original = await downloadPrivateObject(BUCKET_ORIGINAL, originalPath);
    const validation = await validateImageFile(original, "image/jpeg");
    if (!validation.ok || validation.detectedType !== "image/jpeg") {
      return NextResponse.json({ error: { code: "INVALID_IMAGE", message: describeValidationError(validation.error!) } }, { status: 415 });
    }
    const digest = sha256Hex(original);
    const duplicate = await checkDuplicate(eventId, digest);
    if (duplicate.isDuplicate && duplicate.existingReportId) return NextResponse.json({ error: { code: "DUPLICATE", message: "This photo was already submitted.", existingReportId: duplicate.existingReportId } }, { status: 409 });
    const exif = await readExif(original);
    const derivatives = await makeDerivatives(original);
    const resolved = resolveLocation({ userSource: meta.locationSource ?? null, userLat: meta.latitude ?? null, userLng: meta.longitude ?? null, exifLat: exif.latitude, exifLng: exif.longitude });
    const boundsError = validateBounds(resolved.latitude, resolved.longitude);
    if (boundsError) return NextResponse.json({ error: { code: "BAD_REQUEST", message: boundsError } }, { status: 400 });
    derivedKeys = await storeDerivedEvidence({ eventId, reportId: grant.reportId, derivative: derivatives.derivative, thumbnail: derivatives.thumbnail });
    const title = meta.title ? sanitizeUserText(meta.title).text : null;
    const description = meta.description ? sanitizeUserText(meta.description).text : null;
    const { error } = await serviceDb().from("reports").insert({
      id: grant.reportId, event_id: eventId, creator_id: user.id, status: "uploaded", title, description,
      latitude: resolved.latitude, longitude: resolved.longitude, location_source: resolved.source, location_label: meta.locationLabel,
      original_storage_key: `${BUCKET_ORIGINAL}/${originalPath}`, derivative_storage_key: derivedKeys.derivativeStorageKey, thumbnail_storage_key: derivedKeys.thumbnailStorageKey,
      sha256: digest, image_mime_type: "image/jpeg", image_bytes: original.byteLength, image_width: derivatives.derivativeWidth, image_height: derivatives.derivativeHeight,
      captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null, uploaded_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not create the report.");
    committed = true;
    try { await notifyReportSubmitted(grant.reportId, eventId); } catch { console.error("[notification] Direct upload committed; notification unavailable."); }
    return NextResponse.json({ ok: true, reportId: grant.reportId, detectedType: "image/jpeg", sha256: digest, exif: { latitude: exif.latitude, longitude: exif.longitude, capturedAt: exif.capturedAt }, locationSource: resolved.source }, { status: 201 });
  } catch (error) {
    console.error("[direct-upload] Finalization failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "FINALIZE_FAILED", message: "The photo could not be finalized. Please retry." } }, { status: 500 });
  } finally {
    if (!committed) await deleteEvidence({
      originalStorageKey: `${BUCKET_ORIGINAL}/${originalPath}`,
      derivativeStorageKey: derivedKeys?.derivativeStorageKey ?? `${"evidence-derivatives"}/${grant.eventId}/${grant.reportId}.jpg`,
      thumbnailStorageKey: derivedKeys?.thumbnailStorageKey ?? `${"evidence-thumbnails"}/${grant.eventId}/${grant.reportId}.jpg`,
    }).catch(() => undefined);
  }
}
