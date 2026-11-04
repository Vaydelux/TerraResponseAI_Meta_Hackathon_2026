import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { loadIncidentWorkspaceSnapshot } from "@/lib/workspace/load-snapshot";
import { hasMapLocation } from "@/lib/workspace/incidents";
import { workspaceAction } from "@/lib/workspace/presentation";
import { DeferredIncidentMap } from "@/components/map/DeferredIncidentMap";
import { ReviewedMapIndex } from "@/components/map/ReviewedMapIndex";
import type { IncidentMapReport } from "@/components/map/IncidentMap";

export default async function MapPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/map"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
  const reports: IncidentMapReport[] = snapshot.reports.filter(hasMapLocation).map((report) => ({
    ...report, latitude: report.latitude as number, longitude: report.longitude as number,
    severity: report.severity ?? undefined, incidentType: report.incident_type,
    priority_score: report.priority_score ?? null,
  }));
  return <div className="mx-auto grid w-full min-w-0 max-w-[1440px] gap-4 px-3 py-4 sm:px-6">
    <header className="flex min-w-0 flex-col gap-4 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid min-w-0 gap-2"><p className="break-words text-sm font-semibold text-tide [overflow-wrap:anywhere]">{snapshot.eventName}</p><h1>Incident map</h1><p className="text-sm text-[var(--ink-2)]">{reports.length} located reports in a window of {snapshot.reports.length} loaded{snapshot.totalCount === null ? "; event total unavailable" : ` of ${snapshot.totalCount}`}. This is a fetched snapshot.</p></div>
      <Link href="/dashboard" className={`${workspaceAction} shrink-0`}>Open command workspace</Link>
    </header>
    {snapshot.state !== "ready" && <div role="alert" className="grid gap-2 rounded-panel border border-[var(--amber)] bg-[var(--amber-wash)] p-4 text-sm text-[var(--amber-ink)]"><strong>{snapshot.state === "unavailable" ? "Incident data unavailable" : "Some incident data is unavailable"}</strong><p>{snapshot.message}</p><a href="/map" className={`${workspaceAction} w-full sm:w-fit`}>Reload map page</a></div>}
    {snapshot.eventId && snapshot.state !== "unavailable" && <DeferredIncidentMap key={snapshot.eventId} eventId={snapshot.eventId} eventName={snapshot.eventName} reports={reports} canReview={ctx.user.role === "reviewer" || ctx.user.role === "admin"} />}
    <ReviewedMapIndex reports={reports} />
    {snapshot.reports.length > reports.length && <p className="text-sm text-[var(--ink-2)]">{snapshot.reports.length - reports.length} reports have no valid map location. They remain available in the command workspace.</p>}
  </div>;
}
