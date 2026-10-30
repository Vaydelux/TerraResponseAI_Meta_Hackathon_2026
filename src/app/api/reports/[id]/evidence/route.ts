// src/app/api/reports/[id]/evidence/route.ts
//
// GET /api/reports/[id]/evidence?kind=derivative|thumbnail|original
//
// Returns a short-lived signed URL to the report's private storage
// object. The signed URL is the "access-controlled URL" the brief
// requires. The server:
//   1. Verifies the user's identity (requireServerUser).
//   2. Verifies the user can access the report (RLS: creator or event
//      reviewer+). If the report row isn't visible, return 403.
//   3. Checks the report's retention state (active/soft_deleted/
//      purged). For soft_deleted + purged, return 410 GONE — the
//      evidence is no longer viewable. The brief: "private-photo
//      retention/deletion workflow, signed URL expiration, access
//      tests, safe file/object cleanup."
//   4. Checks the per-user signed-URL rate limit
//      (SIGNED_URL_RATE_LIMIT_PER_MIN, default 60). Returns 429 on
//      exceed. The brief: "per-user and per-event server-enforced
//      rate limits."
//   5. Mints a 60-second signed URL via the service-role client
//      (server-side only; bypasses storage RLS but the app-layer
//      authz already checked access).
//   6. Inserts a row into evidence_signed_url_log (audit trail + the
//      surface the rate-limit count uses).
//   7. Returns the signed URL. The client fetches the image from it.
//
// Per the brief: "private evidence display through access-controlled
// URLs."
//
// The `original` kind is restricted: only the report's creator or an
// event reviewer+ can get the original (it has EXIF intact). The
// `derivative` and `thumbnail` kinds are available to any event
// member (the derivative is EXIF-stripped).
//
// Signed URL expiration: 60 seconds (SIGNED_URL_TTL_SECONDS). The
// brief: "signed URL expiration." The TTL is short so a leaked URL
// is useless within a minute. The TTL is logged on
// evidence_signed_url_log so an auditor can verify.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireServerUser } from "@/lib/supabase/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseUrl, serviceRoleKey, isSupabaseConfigured } from "@/lib/supabase/env";
import { checkSignedUrlRate } from "@/lib/rate-limit";
import { getRetentionState } from "@/lib/storage/retention";

const SIGNED_URL_TTL_SECONDS = 60;

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

  const { id } = await params;
  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") ?? "derivative") as
    | "derivative"
    | "thumbnail"
    | "original";

  // 1. Verify the user can access the report (RLS: creator or event
  //    reviewer+). The Supabase SSR client uses the user's cookies
  //    so RLS applies.
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, creator_id, original_storage_key, derivative_storage_key, thumbnail_storage_key")
    .eq("id", id)
    .maybeSingle();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 1b. Retention gate: refuse to mint URLs for soft_deleted or purged
  //     reports. The evidence is no longer viewable. The brief:
  //     "private-photo retention/deletion workflow."
  const retentionState = await getRetentionState(id);
  if (retentionState === "soft_deleted") {
    return NextResponse.json(
      {
        error: {
          code: "SOFT_DELETED",
          message:
            "This report's evidence was requested for deletion. Signed URLs are no longer issued.",
        },
      },
      { status: 410 },
    );
  }
  if (retentionState === "purged") {
    return NextResponse.json(
      {
        error: {
          code: "PURGED",
          message: "This report's evidence has been purged from storage.",
        },
      },
      { status: 410 },
    );
  }

  // 1c. Per-user signed-URL rate limit (SIGNED_URL_RATE_LIMIT_PER_MIN,
  //     default 60). The brief: "per-user ... server-enforced rate
  //     limits." Without this, a user could mint thousands of 60s
  //     URLs and overload storage.
  const rate = await checkSignedUrlRate(user.id);
  if (!rate.ok) {
    return NextResponse.json(
      { error: { code: rate.code, message: rate.message, used: rate.used, limit: rate.limit } },
      { status: 429 },
    );
  }

  // 2. Pick the storage key based on the kind.
  let storageKey: string | null;
  switch (kind) {
    case "original":
      storageKey = report.original_storage_key;
      break;
    case "thumbnail":
      storageKey = report.thumbnail_storage_key;
      break;
    case "derivative":
    default:
      storageKey = report.derivative_storage_key;
      break;
  }
  if (!storageKey) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `${kind} not available for this report.` } },
      { status: 404 },
    );
  }

  // 3. For the `original` kind: the report query above is RLS-bound,
  //    so the user is already confirmed to be the creator OR an event
  //    reviewer+ (the reports_select_creator_or_event_reviewer_or_admin
  //    policy). The derivative + thumbnail are available to any user
  //    who can see the report (same RLS policy). No additional app-layer
  //    check is needed — RLS already gated access.

  // 4. Mint the signed URL via the service-role client (bypasses
  //    storage RLS; the app-layer authz above is the gate).
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Split the storage key: "<bucket>/<path>".
  const slashIdx = storageKey.indexOf("/");
  const bucket = storageKey.slice(0, slashIdx);
  const path = storageKey.slice(slashIdx + 1);

  const { data: signedUrlData, error: signErr } =
    await serviceClient.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signedUrlData) {
    return NextResponse.json(
      { error: { code: "SIGN_FAILED", message: signErr?.message ?? "Could not create signed URL." } },
      { status: 500 },
    );
  }

  // 5. Audit: insert a row into evidence_signed_url_log. Best-effort
  //    (a failed insert doesn't fail the request — the URL is already
  //    minted). Logged server-side on failure.
  try {
    await supabase.from("evidence_signed_url_log").insert({
      user_id: user.id,
      report_id: id,
      kind,
      ttl_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error(
      `[evidence] signed-url log insert failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return NextResponse.json({
    ok: true,
    kind,
    signedUrl: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    // Expose the retention state so the client UI can show a
    // "pending deletion" badge before the URL is even fetched.
    retentionState,
  });
}
