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

  // Read-only fallback: display actual stored reports individually.
  // Without measured distance, recency and a persisted incident membership,
  // we must NEVER invent an incident cluster or a hazard classification.
  let reportHistoryUnavailable = false;
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
    const { data: reportRows, error: reportsError } = await db
      .from("reports")
      .select("id,event_id,title,status,review_outcome,location_label,latitude,longitude,uploaded_at,report_analyses(structured_observation)")
      .in("event_id", ids)
      .order("uploaded_at", { ascending: false })
      .limit(50);
    reportHistoryUnavailable = Boolean(reportsError);
    if (!reportsError) {
      derivedClusters = (reportRows ?? []).map((item) => {
        const r = item as unknown as {
          id: string; event_id: string; title: string | null; status: string;
          review_outcome: string | null; location_label: string | null;
          latitude: number | null; longitude: number | null; uploaded_at: string;
          report_analyses?: Array<{ structured_observation?: { incident_type?: string } }>;
        };
        const analysis = Array.isArray(r.report_analyses) ? r.report_analyses[0] : r.report_analyses;
        const rawCategory = analysis?.structured_observation?.incident_type;
        const category = typeof rawCategory === "string" && rawCategory.trim() ? rawCategory : "unclassified";
        const hasCoordinates = typeof r.latitude === "number" && Number.isFinite(r.latitude) &&
          typeof r.longitude === "number" && Number.isFinite(r.longitude) &&
          Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180;
        return {
          id: r.id,
          title: r.title?.trim() || "Report awaiting classification",
          incident_type: category,
          status: r.status === "reviewed" && r.review_outcome === "confirmed" ? "reviewed" : "unverified",
          event_id: r.event_id,
          last_observed_at: r.uploaded_at,
          reportCount: 1,
          leadReportId: r.id,
          locationLabel: r.location_label?.trim() ||
            (hasCoordinates ? `${r.latitude!.toFixed(4)}, ${r.longitude!.toFixed(4)} (submitted)` : "Location not supplied"),
        };
      });
    }
  }

  const usingStoredThreads = !error && Boolean(incidents?.length);
  const totalThreads =
    usingStoredThreads
      ? incidents!.length
      : reportHistoryUnavailable ? 0 : derivedClusters.length;
  const totalLinkedReports =
    usingStoredThreads
      ? Array.from(visibleCounts.values()).reduce((sum, n) => sum + n, 0)
      : reportHistoryUnavailable ? 0 : derivedClusters.reduce((sum, c) => sum + c.reportCount, 0);
  const verifiedThreads =
    usingStoredThreads
      ? (incidents ?? []).filter((i) => String(i.status).includes("verified") || String(i.status).includes("confirmed")).length
      : reportHistoryUnavailable ? 0 : derivedClusters.filter((c) => c.status === "reviewed").length;

  return (
    <section className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Incident Threads & Hazard Clusters"
        subtitle="Persisted incident threads when available, otherwise individual stored reports. A suggested match is not independent disaster confirmation."
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
            <span className="kpi-card__label">{usingStoredThreads ? "Persisted incident threads" : "Recent stored reports"}</span>
          </div>
          <div className="kpi-card__value num">{reportHistoryUnavailable && !usingStoredThreads ? "—" : totalThreads}</div>
          <div className="kpi-card__sub">{usingStoredThreads ? "Server-stored incident groups" : "No spatial correlation inferred"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">{usingStoredThreads ? "Linked Field Reports" : "Report history entries"}</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {reportHistoryUnavailable && !usingStoredThreads ? "—" : totalLinkedReports}
          </div>
          <div className="kpi-card__sub">{usingStoredThreads ? "Authorized linked submissions" : "Each entry is one stored report"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">{usingStoredThreads ? "Stored reviewed threads" : "Human-reviewed reports"}</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--green-ink)" }}>
            {reportHistoryUnavailable && !usingStoredThreads ? "—" : verifiedThreads}
          </div>
          <div className="kpi-card__sub">{usingStoredThreads ? "Recorded thread status" : "Recorded report review outcome"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Grouping method</span>
          </div>
          <div className="kpi-card__value num" style={{ fontSize: "var(--step-2)" }}>
            {usingStoredThreads ? "Server-managed" : "Not applied"}
          </div>
          <div className="kpi-card__sub">{usingStoredThreads ? "No threshold claimed by this UI" : "No proximity or recency inference"}</div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm">Persisted incident threads are unavailable. Showing separate stored reports only when their read succeeds; no grouping is inferred.</p>}
      {reportHistoryUnavailable && <p role="alert" className="rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm">Recent report history is unavailable; no zero-report claim can be made.</p>}
      {usingStoredThreads ? (
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
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
                  {readableType(c.incident_type).toUpperCase()} · STORED REPORT
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
                  "Authorized event"}{" "}
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
                  Stored report · not a proximity match
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
            No stored incident threads or report entries yet
          </h2>
          <p className="t-meta" style={{ margin: 0 }}>
            Incident grouping requires actual spatial-temporal matching. Recent authorized reports appear individually until a persisted thread is available.
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
