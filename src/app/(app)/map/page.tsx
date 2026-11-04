// src/app/(app)/map/page.tsx
//
// Tactical Incident Map & Command Center page. Server-side fetches
// the initial geo-tagged reports for the active event (both confirmed
// and pending so the reviewer can filter between Confirmed Only and
// Show Pending Review, scrub temporally, and inspect by hazard vector).

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import type { IncidentMapReport } from "@/components/map/IncidentMap";
import { DeferredIncidentMap } from "@/components/map/DeferredIncidentMap";
import { EmptyState, Button } from "@/components/ui-tr";

export default async function MapPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/map"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tr-active-event")?.value;
  const activeEvent =
    (cookieId ? ctx.events.find((e) => e.event_id === cookieId) : null) ??
    ctx.events.find((e) => e.event_slug === "community-intake") ??
    ctx.events[0] ??
    null;
  const activeEventId = activeEvent?.event_id ?? null;

  if (!activeEventId) {
    return (
      <div className="tr-page">
        <PageHeader
          title="Incident map"
          subtitle="Confirmed incidents appear as solid pins. Pending ones (hatched) can be toggled on."
        />
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet."
        />
      </div>
    );
  }

  // Fetch initial geo-tagged reports for the active event.
  const supabase = await createSupabaseServerClient();
  const { data: mapRows } = await supabase
    .from("reports")
    .select(
      "id, title, description, status, review_outcome, latitude, longitude, priority_score, location_source, retention_state, location_label, uploaded_at, report_analyses(structured_observation)",
    )
    .eq("event_id", activeEventId)
    .neq("location_source", "unknown")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(200);

  const reports: IncidentMapReport[] = (mapRows ?? [])
    .map((r) => {
      const row = r as unknown as {
        id: string;
        title: string | null;
        description: string | null;
        status: string;
        review_outcome: string | null;
        latitude: number;
        longitude: number;
        priority_score: number | null;
        location_source: string;
        location_label: string | null;
        retention_state: string | null;
        uploaded_at: string;
        report_analyses?: Array<{
          structured_observation: {
            incident_type?: string;
            preliminary_severity?: number;
            summary_en?: string;
          };
        }> | null;
      };
      const analysisEntry = Array.isArray(row.report_analyses) ? row.report_analyses[0] : row.report_analyses;
      const obs = (analysisEntry as { structured_observation?: { incident_type?: string; preliminary_severity?: number; summary_en?: string } } | undefined)?.structured_observation ?? {};
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        review_outcome: row.review_outcome,
        latitude: row.latitude,
        longitude: row.longitude,
        priority_score: row.priority_score,
        retention_state: row.retention_state ?? "active",
        location_label: row.location_label,
        uploaded_at: row.uploaded_at,
        incidentType: (obs.incident_type as string) ?? null,
        severity: (obs.preliminary_severity as number) ?? undefined,
        summary: (obs.summary_en as string) ?? null,
      };
    })
    .filter((r) => r.review_outcome !== "rejected");

  const canReview = ctx.user.role === "reviewer" || ctx.user.role === "admin";

  return (
    <div className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title={`Incident Map · ${activeEvent?.event_name ?? "Active Sector"}`}
        subtitle="Confirmed incidents appear as solid pins. Pending AI observations appear hatched. Filter by hazard vector or scrub temporally below."
        actions={
          <>
            <Button href="/reports/new">Upload evidence</Button>
            {canReview && (
              <Button variant="primary" href="/review">
                Open review queue
              </Button>
            )}
          </>
        }
      />
      <DeferredIncidentMap
        eventId={activeEventId}
        eventName={activeEvent?.event_name}
        canReview={canReview}
        reports={reports}
      />
    </div>
  );
}
