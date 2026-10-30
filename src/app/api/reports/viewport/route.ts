// src/app/api/reports/viewport/route.ts
//
// GET /api/reports/viewport?event_id=<id>&sw_lat=<lat>&sw_lon=<lon>&ne_lat=<lat>&ne_lon=<lon>&limit=200
//
// Returns reports within a map bounding box (southwest + northeast
// corners). Uses PostGIS ST_Intersects with ST_MakeEnvelope for
// efficient bounding-box filtering. Scoped to the caller's event
// membership via RLS + explicit membership check.
//
// Per the brief:
//   - "Accept southwest and northeast map coordinates."
//   - "Validate and normalize valid geographic bounds."
//   - "Handle longitude bounds crossing the antimeridian correctly."
//   - "Apply event membership restrictions."
//   - "Exclude reports with unknown coordinates."
//   - "Return a bounded number of markers."
//
// The antimeridian crossing is handled by the PostGIS RPC function
// (ST_MakeEnvelope with sw_lon > ne_lon wraps around 180/-180).

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id");
  const swLat = Number(url.searchParams.get("sw_lat") ?? "");
  const swLon = Number(url.searchParams.get("sw_lon") ?? "");
  const neLat = Number(url.searchParams.get("ne_lat") ?? "");
  const neLon = Number(url.searchParams.get("ne_lon") ?? "");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );

  // Validate required params
  if (!eventId) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "event_id is required." } },
      { status: 400 },
    );
  }
  if (!Number.isFinite(swLat) || !Number.isFinite(swLon) ||
      !Number.isFinite(neLat) || !Number.isFinite(neLon)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "sw_lat, sw_lon, ne_lat, ne_lon must be valid numbers." } },
      { status: 400 },
    );
  }
  if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Latitude must be between -90 and 90." } },
      { status: 400 },
    );
  }
  if (swLon < -180 || swLon > 180 || neLon < -180 || neLon > 180) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Longitude must be between -180 and 180." } },
      { status: 400 },
    );
  }
  if (swLat >= neLat) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "sw_lat must be less than ne_lat." } },
      { status: 400 },
    );
  }

  // Event membership check (defense-in-depth with RLS)
  const membership = ctx.events.find((e) => e.event_id === eventId);
  if (!membership) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You are not a member of this event." } },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Call the PostGIS RPC function for viewport reports.
  // The function is SECURITY INVOKER — RLS applies.
  const { data: reports, error: rpcErr } = await supabase
    .rpc("viewport_reports", {
      p_event_id: eventId,
      p_sw_lat: swLat,
      p_sw_lon: swLon,
      p_ne_lat: neLat,
      p_ne_lon: neLon,
      p_limit: limit,
    });

  if (rpcErr) {
    console.error(`[viewport] RPC failed: ${rpcErr.message}`);
    return NextResponse.json(
      { error: { code: "QUERY_FAILED", message: rpcErr.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reports: reports ?? [],
    count: (reports ?? []).length,
    bounds: { sw_lat: swLat, sw_lon: swLon, ne_lat: neLat, ne_lon: neLon },
  });
}
