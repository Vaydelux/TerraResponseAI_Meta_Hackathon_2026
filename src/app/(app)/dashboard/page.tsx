// src/app/(app)/dashboard/page.tsx
//
// The dashboard. A launchpad — light touch per the brief: "the
// dashboard is a launchpad, not a primary screen." Shows honest
// metrics (drawn from /api/reports) + a 6-card grid of the most
// recent reports using the new ReportCard.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportCard } from "@/components/report/ReportCard";
import type { ReportRowData } from "@/components/report/ReportRow";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { Button } from "@/components/ui-tr";
import Link from "next/link";
import type { UserEventMembership } from "@/lib/auth/profile";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));

  const supabase = await createSupabaseServerClient();
  const eventIds = ctx.events.map((e) => e.event_id);

  // Honest metrics — counts from the DB.
  const [allRes, pendingRes, reviewedRes, unlocatedRes, failedRes, manualRes] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "needs_review"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "reviewed"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("location_source", "unknown"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "retryable_error"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "needs_manual_review"),
  ]);

  const stats = [
    { label: "Reports received", value: allRes.count ?? 0 },
    { label: "Awaiting review", value: (pendingRes.count ?? 0) + (manualRes.count ?? 0) },
    { label: "Reviewed", value: reviewedRes.count ?? 0 },
    { label: "Unlocated", value: unlocatedRes.count ?? 0 },
    { label: "AI analysis failed", value: failedRes.count ?? 0 },
  ];

  // The 6 most recent reports (with the AI observation joined so the
  // card can show the incident type).
  const { data: recentRows } = await supabase
    .from("reports")
    .select(
      "id, status, review_outcome, title, description, latitude, longitude, location_source, location_label, image_mime_type, captured_at, uploaded_at, priority_score, created_at, report_analyses(structured_observation)",
    )
    .in("event_id", eventIds)
    .order("created_at", { ascending: false })
    .range(0, 5);

  const recent: ReportRowData[] = (recentRows ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      status: string;
      review_outcome: string | null;
      title: string | null;
      description: string | null;
      latitude: number | null;
      longitude: number | null;
      location_source: string;
      location_label: string | null;
      captured_at: string | null;
      uploaded_at: string;
      priority_score: number | null;
      report_analyses?: Array<{ structured_observation: { incident_type?: string; preliminary_severity?: number } }>;
    };
    const obs = row.report_analyses?.[0]?.structured_observation ?? {};
    return {
      id: row.id,
      status: row.status,
      review_outcome: row.review_outcome,
      title: row.title,
      description: row.description,
      location_source: row.location_source,
      location_label: row.location_label,
      latitude: row.latitude,
      longitude: row.longitude,
      uploaded_at: row.uploaded_at,
      captured_at: row.captured_at,
      priority_score: row.priority_score,
      incident_type: (obs.incident_type as string) ?? null,
      severity: (obs.preliminary_severity as number) ?? null,
    };
  });

  const activeEvent: UserEventMembership | null = ctx.events[0] ?? null;

  return (
    <div className="tr-page">
      <PageHeader
        title="Dashboard"
        subtitle="Honest metrics from database queries. No fabricated or cached numbers."
        actions={
          <>
            <Button variant="primary" href="/reports/new">Upload a photo</Button>
            <Button href="/review">Open review queue</Button>
          </>
        }
      />

      {ctx.events.length === 0 ? (
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet. An admin must add you to one."
          action={<Link className="btn" href="/profile">View your profile</Link>}
        />
      ) : (
        <>
          <section aria-label="Metrics">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "var(--s-3)",
              }}
            >
              {stats.map((s) => (
                <div key={s.label} className="panel panel--sunk" style={{ padding: "var(--s-4)", display: "grid", gap: 4 }}>
                  <div className="t-label" style={{ fontSize: "var(--step--1)" }}>{s.label}</div>
                  <div className="num" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--step-2)" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Recent reports" style={{ marginTop: "var(--s-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--s-3)" }}>
              <h2 style={{ fontSize: "var(--step-1)" }}>Recent reports</h2>
              <Link href="/reports" className="t-meta" style={{ color: "var(--tide)" }}>All reports →</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Submitted disaster photos appear here once the upload pipeline is wired."
                action={<Button variant="primary" href="/reports/new">Upload the first photo</Button>}
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "var(--s-4)",
                }}
              >
                {recent.map((r) => (
                  <ReportCard key={r.id} report={r} eventName={activeEvent?.event_name} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
