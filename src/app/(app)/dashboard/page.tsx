// src/app/(app)/dashboard/page.tsx
//
// Overview Dashboard. Combines a welcoming 4-step workflow guide,
// honest database-backed KPI cards, the severity-banded Active
// Incident Triage grid, the interactive Quick Actions Hub (with
// F1–F4 shortcuts), and the Recent Activity & Alerts Stream.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  MapPinOff,
  Clock,
  ShieldCheck,
  Bell,
  Activity,
} from "lucide-react";
import { IncidentTriageCard } from "@/components/report/IncidentTriageCard";
import { QuickActionsHub } from "@/components/report/QuickActionsHub";
import { KeyboardShortcutsDock } from "@/components/report/KeyboardShortcutsDock";
import type { ReportRowData } from "@/components/report/ReportRow";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { Button } from "@/components/ui-tr";
import { formatRelativeTime } from "@/lib/design/format";
import type { UserEventMembership } from "@/lib/auth/profile";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  const supabase = await createSupabaseServerClient();
  const eventIds = ctx.events.map((e) => e.event_id);

  // A broad reporting workspace is internal routing metadata, not
  // something a resident must select before submitting evidence.
  const activeEvent: UserEventMembership | null =
    ctx.events.find((e) => e.event_slug === "community-intake") ??
    ctx.events[0] ?? null;

  // Honest metrics — counts from the DB across the user's events.
  const [allRes, pendingRes, reviewedRes, unlocatedRes, failedRes, manualRes] =
    eventIds.length > 0
      ? await Promise.all([
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "needs_review"),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "reviewed"),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("location_source", "unknown"),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "retryable_error"),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "needs_manual_review"),
        ])
      : [
          { count: 0 },
          { count: 0 },
          { count: 0 },
          { count: 0 },
          { count: 0 },
          { count: 0 },
        ];

  const totalReceived = allRes.count ?? 0;
  const awaitingReview = (pendingRes.count ?? 0) + (manualRes.count ?? 0);
  const totalReviewed = reviewedRes.count ?? 0;
  const totalUnlocated = unlocatedRes.count ?? 0;
  const totalFailed = failedRes.count ?? 0;
  const verificationRate =
    totalReceived > 0 ? Math.round((totalReviewed / totalReceived) * 100) : 0;

  // Top 6 reports ordered by priority score desc, then newest first
  const { data: recentRows } =
    eventIds.length > 0
      ? await supabase
          .from("reports")
          .select(
            "id, status, review_outcome, title, description, latitude, longitude, location_source, location_label, image_mime_type, captured_at, uploaded_at, priority_score, created_at, report_analyses(structured_observation)",
          )
          .in("event_id", eventIds)
          .order("priority_score", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(0, 5)
      : { data: [] };

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
      report_analyses?: Array<{
        structured_observation: { incident_type?: string; preliminary_severity?: number };
      }>;
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

  // Fetch recent audit events (if reviewer/admin) or derive activity from recent reports
  const canReview = ctx.user.role === "reviewer" || ctx.user.role === "admin";
  let streamItems: Array<{
    id: string;
    category: string;
    title: string;
    detail: string;
    timestamp: string;
    badge: string;
    tone: "amber" | "green" | "brick" | "tide";
  }> = [];

  if (canReview) {
    const { data: auditRows } = await supabase
      .from("audit_events")
      .select("id, created_at, actor_name, actor_email, action, target, details")
      .order("created_at", { ascending: false })
      .range(0, 4);

    if (auditRows && auditRows.length > 0) {
      streamItems = auditRows.map((a) => {
        const row = a as unknown as {
          id: string;
          created_at: string;
          actor_name: string | null;
          actor_email: string | null;
          action: string;
          target: string | null;
          details: string | null;
        };
        const actionClean = row.action.replace(/_/g, " ").toUpperCase();
        // A review was performed is NOT equivalent to human confirmation.
        // Never label a rejection, flag, or requested correction "VERIFIED".
        const isConfirm = /(^|_)confirm(ed)?($|_)/.test(row.action);
        const isReject = /(^|_)reject(ed)?($|_)/.test(row.action);
        const isFlag = /(^|_)flag(ged)?($|_)/.test(row.action);
        return {
          id: row.id,
          category: actionClean,
          title: row.details || `Activity recorded on ${row.target ?? "report"}`,
          detail: `By ${row.actor_name || row.actor_email || "System"}${row.target ? ` · Ref: ${row.target.slice(0, 8)}` : ""}`,
          timestamp: row.created_at,
          badge: isConfirm ? "CONFIRMED" : isReject ? "REJECTED" : isFlag ? "FLAGGED" : "RECORDED",
          tone: isConfirm ? "green" : isReject ? "brick" : isFlag ? "amber" : "tide",
        };
      });
    }
  }

  // Fallback / supplement stream from actual report rows when auditRows is empty
  if (streamItems.length === 0 && recent.length > 0) {
    streamItems = recent.slice(0, 4).map((r) => {
      const isReviewed = r.status === "reviewed";
      const isConfirmed = isReviewed && r.review_outcome === "confirmed";
      const isRejected = isReviewed && r.review_outcome === "rejected";
      const isFlagged = isReviewed && r.review_outcome === "flagged";
      const isFailed = r.status === "retryable_error";
      return {
        id: r.id,
        category: (r.incident_type ?? "FIELD REPORT").replace(/_/g, " ").toUpperCase(),
        title: r.title || `Report #TR-${r.id.slice(0, 6).toUpperCase()} (${r.location_label || "Field upload"})`,
        detail: `Status: ${r.status.replace(/_/g, " ")}${r.review_outcome ? ` · ${r.review_outcome}` : ""} · Priority: ${r.priority_score ?? "—"}`,
        timestamp: r.uploaded_at,
        badge: isConfirmed ? "CONFIRMED" : isRejected ? "REJECTED" : isFlagged ? "FLAGGED"
          : isReviewed ? "REVIEWED" : isFailed ? "NEEDS RETRY" : "NEEDS REVIEW",
        tone: isConfirmed ? "green" : isRejected ? "brick" : isFlagged ? "amber"
          : isReviewed ? "tide" : isFailed ? "brick" : "amber",
      };
    });
  }

  const displayName = ctx.user.name || ctx.user.email.split("@")[0];
  const utcNow = new Date().toISOString().slice(11, 16);

  return (
    <div className="tr-page" style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Friendly Welcome Header */}
      <header className="welcome-hero-banner">
        <div style={{ display: "grid", gap: 6 }}>
          <div className="t-meta" style={{ fontWeight: 700, color: "var(--tide)" }}>
            Reporting access · Role: {ctx.user.role}
          </div>
          <h1 style={{ fontSize: "var(--step-3)", lineHeight: 1.15 }}>
            Welcome back, {displayName}.{" "}
            <span style={{ fontWeight: 400, color: "var(--ink-2)" }}>
              Share what you see — no disaster event setup required.
            </span>
          </h1>
          <p className="t-meta">
            Live summary of submitted disaster photos, AI observations, and human verification progress.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--s-2)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
            <span
              className="t-meta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--r-ctl)",
                background: "var(--green-wash)",
                color: "var(--green-ink)",
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              Human-Review Protected
            </span>
            <span
              className="t-meta num"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--r-ctl)",
                background: "var(--sheet-sunk)",
                border: "1px solid var(--rule)",
              }}
            >
              <Clock size={14} aria-hidden="true" />
              {utcNow} UTC
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
            <Button variant="primary" href="/reports/new">
              Upload a photo
            </Button>
            {canReview ? (
              <Button href="/review">Open review queue</Button>
            ) : (
              <Button href="/map">Explore incident map</Button>
            )}
          </div>
        </div>
      </header>

      {/* User-Friendly 4-Step Workflow Strip */}
      <section aria-label="How TerraResponse works" className="workflow-strip">
        <div className="workflow-strip__step">
          <span className="workflow-strip__num">1</span>
          <div>
            <strong style={{ display: "block", color: "var(--ink)" }}>Upload a Photo</strong>
            <span className="t-meta">Attach field imagery &amp; GPS pin</span>
          </div>
        </div>
        <div className="workflow-strip__step">
          <span className="workflow-strip__num">2</span>
          <div>
            <strong style={{ display: "block", color: "var(--ink)" }}>AI Organizes Evidence</strong>
            <span className="t-meta">Drafts hazard type &amp; severity</span>
          </div>
        </div>
        <div className="workflow-strip__step">
          <span className="workflow-strip__num">3</span>
          <div>
            <strong style={{ display: "block", color: "var(--ink)" }}>Human Verifies</strong>
            <span className="t-meta">Reviewer confirms or corrects</span>
          </div>
        </div>
        <div className="workflow-strip__step">
          <span className="workflow-strip__num">4</span>
          <div>
            <strong style={{ display: "block", color: "var(--ink)" }}>Live on Incident Map</strong>
            <span className="t-meta">Verified pins guide response</span>
          </div>
        </div>
      </section>

      {ctx.events.length === 0 ? (
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet. An admin must add you to one."
          action={<Link className="btn" href="/profile">View your profile</Link>}
        />
      ) : (
        <>
          {/* 4 Clear KPI Cards */}
          <section aria-label="Workspace metrics">
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span className="t-label" style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                    Total Reports
                  </span>
                  <span className="kpi-card__icon" style={{ color: "var(--tide)", background: "var(--tide-wash)" }}>
                    <AlertTriangle size={18} aria-hidden="true" />
                  </span>
                </div>
                <div>
                  <span className="kpi-card__value num">{totalReceived}</span>
                  <span className="t-meta" style={{ marginLeft: 8 }}>photos submitted</span>
                </div>
                <div className="t-meta num">
                  {awaitingReview} waiting for review · {totalReviewed} verified
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span className="t-label" style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                    Waiting for Review
                  </span>
                  <span className="kpi-card__icon" style={{ color: "var(--amber-ink)", background: "var(--amber-wash)" }}>
                    <ClipboardCheck size={18} aria-hidden="true" />
                  </span>
                </div>
                <div>
                  <span className="kpi-card__value num">{awaitingReview}</span>
                  <span className="t-meta" style={{ marginLeft: 8 }}>in review queue</span>
                </div>
                <div className="t-meta num">
                  {pendingRes.count ?? 0} AI-drafted · {manualRes.count ?? 0} manual check
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span className="t-label" style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                    Verification Progress
                  </span>
                  <span className="kpi-card__icon" style={{ color: "var(--green)", background: "var(--green-wash)" }}>
                    <CheckCircle2 size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span className="kpi-card__value num">{verificationRate}%</span>
                  <span className="t-meta num" style={{ color: "var(--green)", fontWeight: 700 }}>
                    {totalReviewed} of {totalReceived} reviewed
                  </span>
                </div>
                <div className="kpi-bar" aria-hidden="true">
                  <div
                    className="kpi-bar__fill"
                    style={{ width: `${verificationRate}%` }}
                  />
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span className="t-label" style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                    Needs Location or Retry
                  </span>
                  <span className="kpi-card__icon">
                    <MapPinOff size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span
                    className="kpi-card__value num"
                    style={{ color: totalFailed > 0 ? "var(--brick)" : "var(--ink)" }}
                  >
                    {totalUnlocated + totalFailed}
                  </span>
                  <span className="t-meta num">
                    {totalUnlocated} unlocated · {totalFailed} failed
                  </span>
                </div>
                <div className="t-meta">
                  Reports without coordinates stay off the map until pinned.
                </div>
              </div>
            </div>
          </section>

          {/* Active Incident Triage Grid */}
          <section aria-label="Priority incident reports">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "var(--s-2)",
                marginBottom: "var(--s-4)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 22,
                    borderRadius: 3,
                    background: "var(--tide)",
                    display: "inline-block",
                  }}
                />
                <h2 style={{ fontSize: "var(--step-2)", margin: 0 }}>Priority Incident Reports</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", flexWrap: "wrap" }}>
                <span className="t-meta">Sorted by priority score</span>
                <Link href="/reports" className="t-meta" style={{ color: "var(--tide)", fontWeight: 600 }}>
                  View all reports ({totalReceived}) →
                </Link>
              </div>
            </div>

            {recent.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Submitted disaster photos appear here once uploaded to the active event."
                action={<Button variant="primary" href="/reports/new">Upload the first photo</Button>}
              />
            ) : (
              <div className="triage-grid">
                {recent.map((r) => (
                  <IncidentTriageCard
                    key={r.id}
                    report={r}
                    eventName={activeEvent?.event_name}
                    canReview={canReview}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Bottom Split: Quick Actions Hub + Recent Activity Stream */}
          <div className="command-bottom-grid">
            <QuickActionsHub canReview={canReview} disableGlobalHotkeys />

            <section className="panel" aria-labelledby="alerts-stream-heading" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-2)", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                  <Bell size={18} aria-hidden="true" style={{ color: "var(--tide)" }} />
                  <h2 id="alerts-stream-heading" style={{ fontSize: "var(--step-1)", margin: 0 }}>
                    Recent Activity &amp; Updates
                  </h2>
                </div>
                <Link
                  href={canReview ? "/audit" : "/reports"}
                  className="t-meta"
                  style={{ color: "var(--tide)", fontWeight: 600 }}
                >
                  View full history →
                </Link>
              </div>

              {streamItems.length === 0 ? (
                <div className="well-uncertain">
                  <p className="t-meta">No recent activity yet. You can upload a photo without choosing an event.</p>
                </div>
              ) : (
                <ul className="alert-stream">
                  {streamItems.map((item) => (
                    <li key={item.id} className="alert-stream__item">
                      <span className="alert-stream__icon" aria-hidden="true">
                        <Activity size={16} />
                      </span>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div className="t-meta num" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <strong style={{ color: "var(--ink)" }}>{item.category}</strong>
                          <span>·</span>
                          <span>{formatRelativeTime(item.timestamp)}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "var(--step-0)" }}>{item.title}</div>
                        <div className="t-meta">{item.detail}</div>
                      </div>
                      <span
                        className="alert-stream__badge t-meta num"
                        style={{
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: 4,
                          background:
                            item.tone === "green"
                              ? "var(--green-wash)"
                              : item.tone === "brick"
                              ? "var(--brick-wash)"
                              : item.tone === "amber"
                              ? "var(--amber-wash)"
                              : "var(--tide-wash)",
                          color:
                            item.tone === "green"
                              ? "var(--green-ink)"
                              : item.tone === "brick"
                              ? "var(--brick-ink)"
                              : item.tone === "amber"
                              ? "var(--amber-ink)"
                              : "var(--tide)",
                        }}
                      >
                        {item.badge}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div
                className="t-meta"
                style={{
                  marginTop: "auto",
                  paddingTop: "var(--s-3)",
                  borderTop: "1px solid var(--rule)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "var(--s-2)",
                }}
              >
                <span>Synced with live event database</span>
                <span style={{ color: "var(--tide)", fontWeight: 600 }}>Real-time query</span>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Persistent Role-Aware Keyboard Shortcuts Footer Tip & Dialog */}
      <KeyboardShortcutsDock
        role={ctx.user.role}
        pendingReviewCount={awaitingReview}
      />
    </div>
  );
}
