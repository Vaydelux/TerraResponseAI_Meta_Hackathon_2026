import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin, Layers, ArrowRight } from "lucide-react";
import { getServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isTriageEnabled } from "@/lib/triage/processing";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportThumb } from "@/components/report/ReportThumb";
import { SealBadge } from "@/components/seal/SealBadge";
import { stateFromReport } from "@/lib/design/status";
import { formatRelativeTime } from "@/lib/design/format";

export const metadata = { title: "Incident detail | TerraResponse AI" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IncidentThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const { data: incident, error } = await db
    .from("incident_threads")
    .select("id,event_id,incident_type,title,status,latitude,longitude,last_observed_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !incident || !ctx.events.some(e => e.event_id === incident.event_id))
    notFound();

  const { data: links, error: linksError } = await db
    .from("incident_report_links")
    .select("report_id,assignment_method,confirmed_match,distance_m,linked_at")
    .eq("incident_id", id)
    .order("linked_at", { ascending: false })
    .limit(100);
  if (linksError) {
    return (
      <section className="tr-page">
        <PageHeader title={incident.title} subtitle="Possible incident thread" />
        <p className="panel" role="alert">
          The linked reports could not be loaded. Please retry.
        </p>
      </section>
    );
  }

  const visibleReportIds = (links ?? []).map((x) => x.report_id as string);
  const { data: reports, error: reportsError } = visibleReportIds.length
    ? await db
        .from("reports")
        .select("id,title,status,review_outcome,location_label,created_at,creator_id")
        .in("id", visibleReportIds)
        .limit(100)
    : { data: [], error: null };
  if (reportsError) {
    return (
      <section className="tr-page">
        <PageHeader title={incident.title} subtitle="Possible incident thread" />
        <p role="alert" className="panel">
          Authorized report details are temporarily unavailable.
        </p>
      </section>
    );
  }
  type VisibleReport = {
    id: string;
    title: string | null;
    status: string;
    review_outcome: string | null;
    location_label: string | null;
    created_at: string;
    creator_id: string;
  };
  const authorized = new Map<string, VisibleReport>();
  for (const report of reports ?? []) {
    authorized.set(report.id as string, report as VisibleReport);
  }
  const reportItems = (links ?? []).flatMap((link) => {
    const report = authorized.get(link.report_id as string);
    return report ? [{ report, link }] : [];
  });

  const canModerate = ctx.user.role === "reviewer" || ctx.user.role === "admin";

  return (
    <section className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title={incident.title}
        subtitle="Multiple pieces of evidence may describe one possible hazard. Grouping does not verify the incident."
        actions={
          <Link href="/incidents" className="btn">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to incident threads</span>
          </Link>
        }
      />

      {/* Command Hub Cluster Dossier KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Hazard Classification</span>
          </div>
          <div
            className="kpi-card__value"
            style={{ fontSize: "var(--step-2)", textTransform: "capitalize" }}
          >
            {incident.incident_type.replaceAll("_", " ")}
          </div>
          <div className="kpi-card__sub">Type: {incident.incident_type.replaceAll("_", " ")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Thread Status</span>
          </div>
          <div
            className="kpi-card__value"
            style={{ fontSize: "var(--step-2)", color: "var(--tide)", textTransform: "capitalize" }}
          >
            {incident.status.replaceAll("_", " ")}
          </div>
          <div className="kpi-card__sub">Thread status: {incident.status}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Visible Evidence</span>
          </div>
          <div className="kpi-card__value num">{reportItems.length}</div>
          <div className="kpi-card__sub">
            {reportItems.length} reports visible to your account · Private evidence is not shared publicly.
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Last Observed</span>
          </div>
          <div className="kpi-card__value num" style={{ fontSize: "var(--step-2)" }}>
            {formatRelativeTime(incident.last_observed_at)}
          </div>
          <div className="kpi-card__sub">
            Last observed: {new Date(incident.last_observed_at).toLocaleString()}
          </div>
        </div>
      </div>

      {reportItems.length === 0 ? (
        <div className="panel">No report evidence is visible to your account.</div>
      ) : (
        <div className="tr-stack">
          {reportItems.map(({ report, link }) => {
            const state = stateFromReport({
              status: report.status,
              reviewOutcome: report.review_outcome,
            });
            const reportTitle = report.title || "Community evidence report";
            return (
              <article
                className="panel"
                key={report.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "88px 1fr auto",
                  gap: "var(--s-4)",
                  alignItems: "center",
                }}
              >
                <ReportThumb reportId={report.id} state={state} alt={reportTitle} />

                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <SealBadge state={state} />
                    <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                      <Link href={`/reports/${report.id}`}>{reportTitle}</Link>
                    </h2>
                  </div>

                  <p className="t-meta" style={{ margin: 0 }}>
                    {report.status.replaceAll("_", " ")} ·{" "}
                    {report.review_outcome ?? "Not human-reviewed"} · Submitted{" "}
                    {new Date(report.created_at).toLocaleString()}
                  </p>

                  {report.location_label && (
                    <p
                      className="t-meta"
                      style={{ display: "flex", alignItems: "center", gap: 5, margin: 0 }}
                    >
                      <MapPin size={13} aria-hidden="true" style={{ color: "var(--tide)" }} />
                      <span>Reported location: {report.location_label}</span>
                    </p>
                  )}

                  <p
                    className="t-meta"
                    style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}
                  >
                    <Layers size={13} aria-hidden="true" style={{ color: "var(--tide)" }} />
                    <span>
                      Match:{" "}
                      {link.confirmed_match
                        ? "Human-confirmed association"
                        : link.assignment_method === "suggested"
                        ? "Suggested by proximity and incident type"
                        : "Automatically placed in a new thread"}
                      {link.distance_m != null
                        ? ` · Approx. ${Math.round(link.distance_m / 100) / 10} km from thread center`
                        : ""}
                    </span>
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Link href={`/reports/${report.id}`} className="btn btn--sm">
                    <span>View evidence</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                  {canModerate && (
                    <Link href={`/review/${report.id}`} className="btn btn--primary btn--sm">
                      <span>Review Workbench</span>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
