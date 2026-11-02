import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isTriageEnabled } from "@/lib/triage/processing";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Incident detail | TerraResponse AI" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IncidentThreadDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fincidents");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  if (!isTriageEnabled()) notFound();

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await createSupabaseServerClient();

  // The incident RLS policy requires at least one accessible underlying
  // report. Do not use service-role access or disclose invisible threads.
  const { data: incident, error } = await db.from("incident_threads")
    .select("id,event_id,incident_type,title,status,latitude,longitude,last_observed_at")
    .eq("id", id).maybeSingle();
  if (error || !incident || !ctx.events.some(e => e.event_id === incident.event_id)) notFound();

  const { data: links, error: linksError } = await db.from("incident_report_links")
    .select("report_id,assignment_method,confirmed_match,distance_m,linked_at")
    .eq("incident_id", id)
    .order("linked_at", { ascending: false }).limit(100);
  if (linksError) {
    return <section className="tr-page">
      <PageHeader title={incident.title} subtitle="Possible incident thread" />
      <p className="panel" role="alert">The linked reports could not be loaded. Please retry.</p>
    </section>;
  }

  const visibleReportIds = (links ?? []).map(x => x.report_id as string);
  const { data: reports, error: reportsError } = visibleReportIds.length
    ? await db.from("reports").select("id,title,status,review_outcome,location_label,created_at,creator_id")
      .in("id", visibleReportIds).limit(100)
    : { data: [], error: null };
  if (reportsError) {
    return <section className="tr-page">
      <PageHeader title={incident.title} subtitle="Possible incident thread" />
      <p role="alert" className="panel">Authorized report details are temporarily unavailable.</p>
    </section>;
  }
  type VisibleReport = {
    id: string; title: string | null; status: string;
    review_outcome: string | null; location_label: string | null;
    created_at: string; creator_id: string;
  };
  const authorized = new Map<string, VisibleReport>();
  for (const report of reports ?? []) {
    authorized.set(report.id as string, report as VisibleReport);
  }
  const reportItems = (links ?? []).flatMap(link => {
    const report = authorized.get(link.report_id as string);
    return report ? [{ report, link }] : [];
  });

  return <section className="tr-page">
    <PageHeader title={incident.title}
      subtitle="Multiple pieces of evidence may describe one possible hazard. Grouping does not verify the incident." />
    <div className="panel" style={{display:"grid",gap:8}}>
      <p><strong>Type:</strong> {incident.incident_type.replaceAll("_"," ")} · <strong>Thread status:</strong> {incident.status}</p>
      <p className="t-meta">Last observed: {new Date(incident.last_observed_at).toLocaleString()}</p>
      <p className="t-meta">{reportItems.length} reports visible to your account · Private evidence is not shared publicly.</p>
      <Link href="/incidents" className="btn">Back to incident threads</Link>
    </div>
    {reportItems.length === 0 ? <div className="panel">No report evidence is visible to your account.</div> :
    <div className="tr-stack">
      {reportItems.map(({ report, link }) => <article className="panel" key={report.id} style={{display:"grid",gap:8}}>
        <h2 style={{fontSize:"var(--step-1)"}}>
          <Link href={`/reports/${report.id}`}>{report.title || "Community evidence report"}</Link>
        </h2>
        <p className="t-meta">
          {report.status.replaceAll("_"," ")} · {report.review_outcome ?? "Not human-reviewed"} ·
          Submitted {new Date(report.created_at).toLocaleString()}
        </p>
        {report.location_label && <p className="t-meta">Reported location: {report.location_label}</p>}
        <p className="t-meta">
          Match: {link.confirmed_match ? "Human-confirmed association" :
            link.assignment_method === "suggested" ? "Suggested by proximity and incident type" :
            "Automatically placed in a new thread"}
          {link.distance_m != null ? ` · Approx. ${Math.round(link.distance_m / 100) / 10} km from thread center` : ""}
        </p>
        <Link href={`/reports/${report.id}`} className="btn">View evidence</Link>
      </article>)}
    </div>}
  </section>;
}
