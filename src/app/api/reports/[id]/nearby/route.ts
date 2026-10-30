// src/app/api/reports/[id]/nearby/route.ts
//
// GET /api/reports/[id]/nearby?radius=1000&limit=20
//
// Returns reports near the specified report within a geographic
// radius (meters). Uses PostGIS ST_DWithin for efficient radius
// search. Scoped to the report's event via RLS + explicit membership
// check.
//
// Per the brief:
//   - "Detect potentially related incidents within a geographic radius."
//   - "Geographic proximity is not proof that two reports describe
//     the same incident."
//   - "Nearby reports must be labeled as potential matches, not
//     confirmed duplicates."
//   - "Never automatically merge or delete incident records."
//
// Returns: id, title, status, review_outcome, location_source,
// latitude, longitude, priority_score, incident_type, distance_meters,
// created_at. No image URLs or storage keys.
//
// The response includes a `provisional: true` flag so the UI can
// label the results as "potential matches" (not confirmed duplicates).

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const MAX_RADIUS = 50000; // 50km — the DB function also enforces this
const DEFAULT_RADIUS = 1000; // 1km
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

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
  const url = new URL(_request.url);
  const radius = Math.min(
    Math.max(Number(url.searchParams.get("radius") ?? DEFAULT_RADIUS), 1),
    MAX_RADIUS,
  );
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );

  const supabase = await createSupabaseServerClient();

  // 1. Fetch the report to get its event_id + lat/lon. RLS-enforced:
  //    only the creator or event reviewer+ can see it.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, event_id, latitude, longitude, location_source")
    .eq("id", id)
    .maybeSingle();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // 2. If the report has unknown location, return an empty result
  //    (no geographic matching for reports without trusted coords).
  if (report.location_source === "unknown" ||
      report.latitude === null || report.longitude === null) {
    return NextResponse.json({
      ok: true,
      provisional: true,
      reports: [],
      message: "This report has no known location. Geographic matching is not available.",
    });
  }

  // 3. Verify the user is a member of the report's event
  //    (defense-in-depth with RLS).
  const membership = ctx.events.find((e) => e.event_id === report.event_id);
  if (!membership) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You are not a member of this event." } },
      { status: 403 },
    );
  }

  // 4. Call the PostGIS RPC function for nearby reports.
  //    The function is SECURITY INVOKER — RLS applies.
  const { data: nearby, error: rpcErr } = await supabase
    .rpc("nearby_reports", {
      p_event_id: report.event_id,
      p_lat: report.latitude,
      p_lon: report.longitude,
      p_radius_m: radius,
      p_limit: limit,
      p_offset: 0,
    });

  if (rpcErr) {
    console.error(`[nearby] RPC failed for ${id}: ${rpcErr.message}`);
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: rpcErr.message } },
      { status: 500 },
    );
  }

  // 5. Filter out the report itself from the results (the RPC
  //    includes it because distance=0 is within the radius).
  const filtered = (nearby ?? []).filter(
    (r: { id: string }) => r.id !== id,
  );

  return NextResponse.json({
    ok: true,
    provisional: true,
    radius_meters: radius,
    reports: filtered,
    message: filtered.length === 0
      ? "No nearby reports found within the specified radius."
      : undefined,
  });
}
