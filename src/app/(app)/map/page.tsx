// src/app/(app)/map/page.tsx
//
// The map page. Uses the new IncidentMap component. Server-side
// fetches the initial reports for the active event (so the page
// paints with markers immediately); the map refetches on move.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { IncidentMap, type IncidentMapReport } from "@/components/map/IncidentMap";
import { EmptyState } from "@/components/ui-tr";

export default async function MapPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/map"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/map"));

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tr-active-event")?.value;
  const activeEventId =
    cookieId && ctx.events.some((e) => e.event_id === cookieId)
      ? cookieId
      : ctx.events[0]?.event_id ?? null;

  if (!activeEventId) {
    return (
      <div className="tr-page">
        <PageHeader title="Incident map" subtitle="Confirmed incidents only. Pending ones appear once they're reviewed." />
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet."
        />
      </div>
    );
  }

  // Fetch the initial reports (only the ones that should appear on
  // the map: confirmed/flagged/resolved + not unknown location).
  const supabase = await createSupabaseServerClient();
  const { data: mapRows } = await supabase
    .from("reports")
    .select(
      "id, title, status, review_outcome, latitude, longitude, priority_score, location_source, retention_state, location_label, uploaded_at, report_analyses(structured_observation)",
    )
    .eq("event_id", activeEventId)
    .neq("location_source", "unknown")
    .in("review_outcome", ["confirmed", "flagged", "resolved"]);

  const reports: IncidentMapReport[] = (mapRows ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      title: string | null;
      status: string;
      review_outcome: string | null;
      latitude: number;
      longitude: number;
      priority_score: number | null;
      location_source: string;
      location_label: string | null;
      retention_state: string | null;
      uploaded_at: string;
      report_analyses?: Array<{ structured_observation: { incident_type?: string; preliminary_severity?: number; summary_en?: string } }> | null;
    };
    const obs = row.report_analyses?.[0]?.structured_observation ?? {};
    return {
      id: row.id,
      title: row.title,
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
  });

  return (
    <>
      <PageHeader
        title="Incident map"
        subtitle="Confirmed incidents appear as solid pins. Pending ones (hatched) can be toggled on. Pin size is constant — never implies triage."
      />
      <IncidentMap eventId={activeEventId} reports={reports} />
    </>
  );
}
