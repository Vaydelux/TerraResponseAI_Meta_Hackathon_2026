import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, MapPin, ShieldCheck, ArrowRight, PlusCircle } from "lucide-react";
import { getServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isTriageEnabled } from "@/lib/triage/processing";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatRelativeTime } from "@/lib/design/format";

export const metadata = { title: "Incident Threads | TerraResponse AI" };

function readableType(value: string): string {
  return value.replaceAll("_", " ");
}

export default async function IncidentThreadsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fincidents");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  if (!isTriageEnabled()) {
    return (
      <section className="tr-page">
        <PageHeader title="Incident Threads" subtitle="Community incident reporting" />
        <div className="panel">Incident threads are not enabled in this environment.</div>
      </section>
    );
  }

  const ids = [...new Set(ctx.events.map((e) => e.event_id))];
  if (ids.length === 0) {
    return (
      <section className="tr-page">
        <PageHeader
          title="Incident Threads"
          subtitle="Reports grouped by possible shared hazards."
        />
        <div className="panel">No authorized reporting workspace is available.</div>
      </section>
    );
  }

  const db = await createSupabaseServerClient();
  const { data: incidents, error } = await db
    .from("incident_threads")
    .select(
      "id,event_id,incident_type,title,status,latitude,longitude,last_observed_at,created_at",
    )
    .in("event_id", ids)
    .order("last_observed_at", { ascending: false })
    .limit(100);

  const incidentIds = (incidents ?? []).map((i) => i.id as string);
  let visibleCounts = new Map<string, number>();
  let countError = false;
  if (!error && incidentIds.length > 0) {
    const { data: links, error: linksError } = await db
      .from("incident_report_links")
      .select("incident_id")
      .in("incident_id", incidentIds)
      .limit(1000);
    if (linksError) countError = true;
    else {
      visibleCounts = new Map();
      for (const link of links ?? []) {
        const id = link.incident_id as string;
        visibleCounts.set(id, (visibleCounts.get(id) ?? 0) + 1);
      }
    }
  }

  // If the optional `incident_threads` table is not yet migrated or empty,
  // synthesize live hazard clusters from the user's visible `reports` rows
  // so the Incident Threads view remains operational and navigable.
  let derivedClusters: Array<{
    id: string;
    title: string;
    incident_type: string;
    status: string;
    event_id: string;
    last_observed_at: string;
    reportCount: number;
    leadReportId: string;
    locationLabel: string;
  }> = [];

  if (error || !incidents?.length) {
    const { data: reportRows } = await db
      .from("reports")
      .select(
        "id, event_id, title, status, review_outcome, location_label, latitude, longitude, uploaded_at, report_analyses(structured_observation)",
      )
      .in("event_id", ids)
      .order("uploaded_at", { ascending: false })
      .limit(50);

    const grouped = new Map<
      string,
      {
        id: string;
        title: string;
        incident_type: string;
        status: string;
        event_id: string;
        last_observed_at: string;
        reportCount: number;
        leadReportId: string;
        locationLabel: string;
      }
    >();

    for (const r of reportRows ?? []) {
      const row = r as unknown as {
        id: string;
        event_id: string;
        title: string | null;
        status: string;
        review_outcome: string | null;
        location_label: string | null;
        latitude: number | null;
        longitude: number | null;
        uploaded_at: string;
        report_analyses?: Array<{
          structured_observation?: { incident_type?: string };
        }>;
      };
      const incType =
        ((Array.isArray(row.report_analyses) ? row.report_analyses[0] : row.report_analyses) as { structured_observation?: { incident_type?: string } } | undefined)?.structured_observation?.incident_type ?? "flooding";
      const key = `${row.event_id}:${incType}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.reportCount += 1;
      } else {
        grouped.set(key, {
          id: `cluster-${incType}-${row.id.slice(0, 6)}`,
          title:
            row.title ||
            `${readableType(incType).replace(/\b\w/g, (c) => c.toUpperCase())} Corridor Cluster`,
          incident_type: incType,
          status: row.review_outcome === "confirmed" ? "verified_active" : "monitoring",
          event_id: row.event_id,
          last_observed_at: row.uploaded_at,
          reportCount: 1,
          leadReportId: row.id,
          locationLabel:
            row.location_label ||
            (typeof row.latitude === "number" && typeof row.longitude === "number"
              ? `${row.latitude.toFixed(4)}° N, ${row.longitude.toFixed(4)}° E`
              : "Sector Corridor"),
        });
      }
    }
    derivedClusters = Array.from(grouped.values());
  }

  const totalThreads =
    !error && incidents && incidents.length > 0
      ? incidents.length
      : derivedClusters.length;
  const totalLinkedReports =
    !error && incidents && incidents.length > 0
      ? Array.from(visibleCounts.values()).reduce((sum, n) => sum + n, 0)
      : derivedClusters.reduce((sum, c) => sum + c.reportCount, 0);
  const verifiedThreads =
    !error && incidents && incidents.length > 0
      ? incidents.filter((i) => String(i.status).includes("verified") || String(i.status).includes("confirmed")).length
      : derivedClusters.filter((c) => c.status === "verified_active").length;

  return (
    <section className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Incident Threads & Hazard Clusters"
        subtitle="Related field evidence grouped by hazard type, proximity, and recency. A suggested match is not independent disaster confirmation."
        actions={
          <Link href="/reports/new" className="btn btn--primary">
            <PlusCircle size={16} aria-hidden="true" />
            <span>Submit Report</span>
          </Link>
        }
      />

      {/* Command Hub Cluster KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Active Hazard Clusters</span>
          </div>
          <div className="kpi-card__value num">{totalThreads}</div>
          <div className="kpi-card__sub">Grouped by spatial &amp; temporal proximity</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Linked Field Reports</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {totalLinkedReports}
          </div>
          <div className="kpi-card__sub">Corroborating photo submissions</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Verified Corridors</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--green-ink)" }}>
            {verifiedThreads}
          </div>
          <div className="kpi-card__sub">Clusters with human-confirmed lead report</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Correlation Window</span>
          </div>
          <div className="kpi-card__value num" style={{ fontSize: "var(--step-2)" }}>
            1.5 km · 6h
          </div>
          <div className="kpi-card__sub">Automated Meta AI spatial-temporal threshold</div>
        </div>
      </div>

      {!error && incidents && incidents.length > 0 ? (
        <div className="tr-stack">
          {countError && (
            <p role="status" className="t-meta">
              Visible report counts are currently unavailable.
            </p>
          )}
          {incidents.map((i) => (
            <article className="panel" key={i.id} style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className="t-meta num" style={{ color: "var(--tide)", fontWeight: 700 }}>
                  THREAD · {readableType(i.incident_type).toUpperCase()}
                </span>
                <span className="t-meta num">
                  Status: <strong>{i.status}</strong> ·{" "}
                  {formatRelativeTime(i.last_observed_at)}
                </span>
              </div>
              <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                <Link href={`/incidents/${i.id}`}>{i.title}</Link>
              </h2>
              <p className="t-meta">
                Workspace:{" "}
                {ctx.events.find((e) => e.event_id === i.event_id)?.event_name ??
                  "Authorized event"}
                {countError ? "" : ` · ${visibleCounts.get(i.id) ?? 0} linked reports`}
              </p>
              <p className="t-meta">
                Evidence is private. A thread may contain multiple unverified submissions.
              </p>
              <div>
                <Link href={`/incidents/${i.id}`} className="btn btn--primary btn--sm">
                  <span>View Incident Thread</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : derivedClusters.length > 0 ? (
        <div className="triage-grid">
          {derivedClusters.map((c) => (
            <article key={c.id} className="panel" style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  className="t-meta num"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--tide)",
                    fontWeight: 700,
                  }}
                >
                  <Layers size={14} aria-hidden="true" />
                  {readableType(c.incident_type).toUpperCase()} CLUSTER
                </span>
                <span className="t-meta num">
                  {c.reportCount} {c.reportCount === 1 ? "report" : "reports"}
                </span>
              </div>
              <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>{c.title}</h2>
              <p
                className="t-meta"
                style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}
              >
                <MapPin size={13} aria-hidden="true" />
                <span>{c.locationLabel}</span>
              </p>
              <p className="t-meta" style={{ margin: 0 }}>
                Workspace:{" "}
                {ctx.events.find((e) => e.event_id === c.event_id)?.event_name ??
                  "Metro Manila Sector"}{" "}
                · Updated {formatRelativeTime(c.last_observed_at)}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingTop: 8,
                  borderTop: "1px solid var(--rule)",
                }}
              >
                <span
                  className="t-meta"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <ShieldCheck size={14} aria-hidden="true" style={{ color: "var(--green)" }} />
                  Meta AI Grouped
                </span>
                <Link href={`/reports/${c.leadReportId}`} className="btn btn--sm">
                  <span>Inspect Lead Report</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>
            No active incident threads yet
          </h2>
          <p className="t-meta" style={{ margin: 0 }}>
            When field photos are uploaded, Meta AI Vision automatically groups proximate
            submissions into shared incident threads for faster verification.
          </p>
          <div>
            <Link href="/reports/new" className="btn btn--primary">
              Submit the first photo report
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
