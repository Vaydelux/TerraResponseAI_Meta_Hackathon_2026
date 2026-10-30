// src/app/api/weather/route.ts
//
// GET /api/weather?reportId=<id>
//
// Returns a 24-hour weather forecast for the report's confirmed
// coordinates, fetched from the Open-Meteo Forecast API (server-side
// only — the browser never calls Open-Meteo directly).
//
// Security:
//   - The reportId is validated + the report is fetched via the SSR
//     client (RLS-enforced — the caller must be able to see the report).
//   - Only reports with location_source in ('gps','manual') are
//     eligible (no forecast for unknown locations).
//   - The coordinates are passed to Open-Meteo as fixed params (no
//     user-supplied URLs).
//   - The response is cached server-side for 10 minutes per the
//     reportId (the `revalidate` option on Next.js fetch).
//
// The browser receives the validated + shaped WeatherForecast JSON.

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchWeatherForecast, type WeatherForecast } from "@/lib/weather/open-meteo";

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

  const url = new URL(request.url);
  const reportId = url.searchParams.get("reportId");

  if (!reportId) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "reportId is required." } },
      { status: 400 },
    );
  }

  // Fetch the report (RLS-enforced — caller must be able to see it)
  const supabase = await createSupabaseServerClient();
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, latitude, longitude, location_source, retention_state")
    .eq("id", reportId)
    .maybeSingle();

  if (reportErr || !report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  // Only gps/manual locations get weather (no forecast for unknown)
  if (report.location_source === "unknown" ||
      report.latitude === null || report.longitude === null) {
    return NextResponse.json({
      ok: true,
      weather: null,
      reason: "NO_LOCATION",
      message: "This report has no confirmed location. Weather context is unavailable.",
    });
  }

  // Check retention state — no weather for soft_deleted/purged
  if (report.retention_state === "soft_deleted" || report.retention_state === "purged") {
    return NextResponse.json({
      ok: true,
      weather: null,
      reason: "RETENTION_BLOCKED",
      message: "This report's evidence was requested for deletion.",
    });
  }

  try {
    const weather: WeatherForecast = await fetchWeatherForecast(
      report.latitude,
      report.longitude,
    );
    return NextResponse.json({ ok: true, weather });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[weather] fetch failed for report ${reportId}: ${message}`);
    return NextResponse.json(
      { error: { code: "WEATHER_UNAVAILABLE", message: "Weather forecast is temporarily unavailable." } },
      { status: 503 },
    );
  }
}
