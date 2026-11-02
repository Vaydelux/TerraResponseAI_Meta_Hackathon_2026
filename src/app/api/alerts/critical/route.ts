// GET /api/alerts/critical — restricted, sanitized provisional alert feed.
// Never exposes raw evidence, names, report captions, exact GPS or user IDs.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireServerUser } from "@/lib/supabase/server";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";

const CACHE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
export const dynamic = "force-dynamic";

export async function GET() {
  // The new reporting workflow is staging-only until security proof is
  // complete. Disabled environments do not expose privileged DB reads.
  if (process.env.REPORT_FIRST_TRIAGE_ENABLED !== "true" ||
      process.env.REPORT_FIRST_CRITICAL_PUBLICATION_ENABLED !== "true" ||
      process.env.DEMO_MODE === "true") {
    return NextResponse.json({ error: { code: "NOT_ENABLED" } },
      { status: 404, headers: CACHE_HEADERS });
  }

  try {
    await requireServerUser(); // Verified session; avoid anonymous scraping.
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } },
      { status: 401, headers: CACHE_HEADERS });
  }
  const url = supabaseUrl(), key = serviceRoleKey();
  if (!url || !key) {
    return NextResponse.json({ error: { code: "UNAVAILABLE" } },
      { status: 503, headers: CACHE_HEADERS });
  }
  const db = createClient(url, key, { auth: {
    persistSession: false, autoRefreshToken: false,
  } });

  // Never use select('*') on a service-role client for a public-facing
  // endpoint. Choose only the minimal subset of safe alert fields.
  const { data: triage, error } = await db.from("report_triage")
    .select("report_id,incident_type,preliminary_severity,processed_at")
    .eq("triage_class", "critical_provisional")
    .eq("verification_status", "awaiting_human")
    .eq("publication_status", "public_provisional")
    .order("processed_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error("[critical-alerts] Unable to query eligible triage records.");
    return NextResponse.json({ error: { code: "UNAVAILABLE" } },
      { status: 503, headers: CACHE_HEADERS });
  }
  if (!triage?.length) {
    return NextResponse.json({ ok: true, alerts: [] }, { headers: CACHE_HEADERS });
  }
  const { data: reports, error: reportError } = await db.from("reports")
    .select("id,latitude,longitude,location_source,status,review_outcome")
    .in("id", triage.map(t => t.report_id))
    .eq("status", "needs_review");
  if (reportError) {
    console.error("[critical-alerts] Unable to verify report visibility.");
    return NextResponse.json({ error: { code: "UNAVAILABLE" } },
      { status: 503, headers: CACHE_HEADERS });
  }
  const eligible = new Map<string, { id: string; latitude: number; longitude: number }>();
  for (const r of reports ?? []) {
    if (r.location_source === "unknown" || !Number.isFinite(r.latitude) ||
        !Number.isFinite(r.longitude) || r.review_outcome !== null) continue;
    eligible.set(r.id as string, {
      id: r.id as string,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    });
  }

  const alerts = triage.flatMap(t => {
    const r = eligible.get(t.report_id as string);
    if (!r || t.preliminary_severity !== 5) return [];
    return [{
      incidentType: t.incident_type,
      severityLevel: 5,
      observedAt: t.processed_at,
      approximateLatitude: Math.round(Number(r.latitude) * 100) / 100,
      approximateLongitude: Math.round(Number(r.longitude) * 100) / 100,
      verification: "awaiting_human" as const,
      assessment: "AI-assessed, not independently confirmed" as const,
    }];
  });
  return NextResponse.json({ ok: true, alerts }, { headers: CACHE_HEADERS });
}
