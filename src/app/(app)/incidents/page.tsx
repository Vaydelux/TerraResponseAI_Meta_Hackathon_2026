import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isTriageEnabled } from "@/lib/triage/processing";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Incident threads | TerraResponse AI" };

function readableType(value: string): string {
  return value.replaceAll("_", " ");
}

export default async function IncidentThreadsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fincidents");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  if (!isTriageEnabled()) {
    return <section className="tr-page">
      <PageHeader title="Incident threads" subtitle="Community incident reporting" />
      <div className="panel">Incident threads are not enabled in this environment.</div>
    </section>;
  }

  const ids = [...new Set(ctx.events.map(e => e.event_id))];
  if (ids.length === 0) {
    return <section className="tr-page">
      <PageHeader title="Incident threads" subtitle="Reports grouped by possible shared hazards." />
      <div className="panel">No authorized reporting workspace is available.</div>
    </section>;
  }
  const db = await createSupabaseServerClient();
  // The user-scoped database client enforces incident_threads RLS.
  // A reporter can only see threads containing reports they can view.
  const { data: incidents, error } = await db.from("incident_threads")
    .select("id,event_id,incident_type,title,status,latitude,longitude,last_observed_at,created_at")
    .in("event_id", ids)
    .order("last_observed_at", { ascending: false })
    .limit(100);

  const incidentIds = (incidents ?? []).map(i => i.id as string);
  let visibleCounts = new Map<string, number>();
  let countError = false;
  if (!error && incidentIds.length > 0) {
    // Only count links visible through their own report-scoped RLS.
    const { data: links, error: linksError } = await db.from("incident_report_links")
      .select("incident_id").in("incident_id", incidentIds).limit(1000);
    if (linksError) countError = true;
    else {
      visibleCounts = new Map();
      for (const link of links ?? []) {
        const id = link.incident_id as string;
        visibleCounts.set(id, (visibleCounts.get(id) ?? 0) + 1);
      }
    }
  }

  return <section className="tr-page">
    <PageHeader title="Incident threads"
      subtitle="Related evidence grouped by type, proximity and recency. A suggested match is not independent disaster confirmation." />
    {error ? <div className="panel" role="alert">Incident threads could not be loaded. Please retry.</div>
    : !incidents?.length ? <div className="panel">
      <p>No incident threads are visible to your account yet.</p>
      <Link href="/reports/new" className="btn">Submit a report</Link>
    </div>
    : <div className="tr-stack">
      {countError && <p role="status" className="t-meta">Visible report counts are currently unavailable.</p>}
      {incidents.map(i => <article className="panel" key={i.id} style={{display:"grid",gap:8}}>
        <h2 style={{fontSize:"var(--step-1)"}}>
          <Link href={`/incidents/${i.id}`}>{i.title}</Link>
        </h2>
        <p className="t-meta">Possible {readableType(i.incident_type)} · Thread status: {i.status}</p>
        <p className="t-meta">Workspace: {ctx.events.find(e => e.event_id === i.event_id)?.event_name ?? "Authorized event"}</p>
        <p className="t-meta">Last observed: {new Date(i.last_observed_at).toLocaleString()}
          {countError ? "" : ` · ${visibleCounts.get(i.id) ?? 0} visible reports`}
        </p>
        <p className="t-meta">Evidence is private. A thread may contain multiple unverified submissions.</p>
        <Link href={`/incidents/${i.id}`} className="btn">View thread</Link>
      </article>)}
    </div>}
  </section>;
}
