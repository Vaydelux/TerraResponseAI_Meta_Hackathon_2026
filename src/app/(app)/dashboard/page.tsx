// src/app/(app)/dashboard/page.tsx
//
// Overview Dashboard — Community & Emergency Response Hub.
// Combines the Sector Header, 4 KPI cards with progress bars,
// AI Tactical Recommendation banner, Active Incident Feeds with
// search & category filters, Quick Agency Dispatch, Recent Verifications,
// Helpline & Shift Readiness Checklist, and Quick Actions Hub.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { DashboardCommandWorkspace } from "@/components/report/DashboardCommandWorkspace";
import { QuickActionsHub } from "@/components/report/QuickActionsHub";
import { KeyboardShortcutsDock } from "@/components/report/KeyboardShortcutsDock";
import type { ReportRowData } from "@/components/report/ReportRow";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { Button } from "@/components/ui-tr";
import type { UserEventMembership } from "@/lib/auth/profile";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  const supabase = await createSupabaseServerClient();
  const eventIds = ctx.events.map((e) => e.event_id);

  const activeEvent: UserEventMembership | null =
    ctx.events.find((e) => e.event_slug === "community-intake") ??
    ctx.events[0] ??
    null;

  // Start independent dashboard queries together. Previously these
  // ran in three serial stages: counts → recent rows → audit activity.
  // Promise.resolve eagerly begins PostgREST thenables before awaiting.
  const auditPromise = Promise.resolve(canReview
    ? supabase.from("audit_events")
        .select("id, created_at, actor_name, actor_email, action, target, details")
        .order("created_at", { ascending: false })
        .range(0, 4)
    : { data: [] });
  const countsPromise = Promise.resolve(
    eventIds.length > 0
      ? Promise.all([
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "needs_review"),
          supabase.from("reports").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("review_outcome", "confirmed"),
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
        ]);

  // Top 12 reports ordered by priority score desc, then newest first
  const recentPromise = Promise.resolve(
    eventIds.length > 0
      ? supabase
          .from("reports")
          .select(
            "id, status, review_outcome, title, description, latitude, longitude, location_source, location_label, image_mime_type, captured_at, uploaded_at, priority_score, created_at, report_analyses(structured_observation)",
          )
          .in("event_id", eventIds)
          .order("priority_score", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(0, 11)
      : { data: [] });

  const [
    [allRes, pendingRes, reviewedRes, unlocatedRes, failedRes, manualRes],
    { data: recentRows },
    { data: auditRows },
  ] = await Promise.all([countsPromise, recentPromise, auditPromise]);

  const totalReceived = allRes.count ?? 0;
  const awaitingReview = (pendingRes.count ?? 0) + (manualRes.count ?? 0);
  const totalReviewed = reviewedRes.count ?? 0;
  const totalUnlocated = unlocatedRes.count ?? 0;
  const totalFailed = failedRes.count ?? 0;
  const verificationRate =
    totalReceived > 0 ? Math.round((totalReviewed / totalReceived) * 100) : 0;

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
        const isConfirm = /(^|_)confirm(ed)?($|_)/.test(row.action);
        const isReject = /(^|_)reject(ed)?($|_)/.test(row.action);
        const isFlag = /(^|_)flag(ged)?($|_)/.test(row.action);
        return {
          id: row.id,
          category: actionClean,
          title: row.details || `Activity recorded on ${row.target ?? "report"}`,
          detail: `By ${row.actor_name || row.actor_email || "System"}${
            row.target ? ` · Ref: ${row.target.slice(0, 8)}` : ""
          }`,
          timestamp: row.created_at,
          badge: isConfirm
            ? "CONFIRMED"
            : isReject
            ? "REJECTED"
            : isFlag
            ? "FLAGGED"
            : "RECORDED",
          tone: isConfirm
            ? "green"
            : isReject
            ? "brick"
            : isFlag
            ? "amber"
            : "tide",
        };
      });
    }
  }

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
        title:
          r.title ||
          `Report #TR-${r.id.slice(0, 6).toUpperCase()} (${r.location_label || "Field upload"})`,
        detail: `Report status: ${r.status.replace(/_/g, " ")}${
          r.review_outcome ? ` (${r.review_outcome})` : ""
        }`,
        timestamp: r.uploaded_at,
        badge: isConfirmed
          ? "CONFIRMED"
          : isRejected
          ? "REJECTED"
          : isFlagged
          ? "FLAGGED"
          : isReviewed
          ? "REVIEWED"
          : isFailed
          ? "RETRY"
          : "PENDING",
        tone: isConfirmed
          ? "green"
          : isRejected
          ? "brick"
          : isFlagged
          ? "amber"
          : isReviewed
          ? "tide"
          : isFailed
          ? "brick"
          : "amber",
      };
    });
  }

  const displayName = ctx.user.name || ctx.user.email.split("@")[0];
  const highPriorityCount = recent.filter((r) => (r.severity ?? 0) >= 4).length;

  return (
    <div className="tr-page" style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Hackathon Command Hub Sector Header (matching reference screenshot) */}
      <header className="welcome-hero-banner">
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              className="t-meta num"
              style={{
                padding: "3px 10px",
                borderRadius: 4,
                background: "var(--tide-wash)",
                color: "var(--tide)",
                fontWeight: 700,
              }}
            >
              {activeEvent?.event_name || "Community reporting"}
            </span>
            <span className="t-meta">· Data from submitted reports · Role: {ctx.user.role}</span>
          </div>
          <h1 style={{ fontSize: "var(--step-3)", lineHeight: 1.15, margin: 0 }}>
            Good afternoon, {displayName}
          </h1>
          <p className="t-meta" style={{ margin: 0, maxWidth: "68ch" }}>
            Review submitted disaster evidence, provisional observations, and human verification status.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--s-2)",
          }}
        >
          <span
            className="t-meta num"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: "var(--r-ctl)",
              background: "var(--sheet-sunk)",
              border: "1px solid var(--rule)",
              fontWeight: 600,
            }}
          >
            <span style={{ color: "var(--brick-ink)", fontWeight: 700 }}>
              {highPriorityCount} High-priority observations
            </span>
            <span>·</span>
            <span style={{ color: "var(--tide)", fontWeight: 700 }}>
              {totalReviewed} Verified Reports
            </span>
          </span>
          <Link href="/map" className="btn btn--sm" style={{ minHeight: 36 }}>
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>Tactical Map</span>
          </Link>
        </div>
      </header>

      {ctx.events.length === 0 ? (
        <EmptyState
          title="Reporting workspace temporarily unavailable"
          description="Your account is signed in, but the shared reporting workspace is not available. You can still try submitting a report."
          action={<Link className="btn" href="/reports/new">Upload photo</Link>}
        />
      ) : (
        <>
          {/* 4 Executive KPI Cards with Progress Bars (matching reference screenshot) */}
          <section aria-label="Workspace metrics">
            <div className="kpi-grid">
              {/* KPI 1: Active Incidents */}
              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span
                    className="t-label"
                    style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}
                  >
                    Active Incidents
                  </span>
                  <span
                    className="kpi-card__icon"
                    style={{ color: "var(--tide)", background: "var(--tide-wash)" }}
                  >
                    <AlertTriangle size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="kpi-card__value num">{totalReceived}</span>
                  <span
                    className="t-meta num"
                    style={{ color: "var(--amber-ink)", fontWeight: 700 }}
                  >
                    {awaitingReview} pending
                  </span>
                </div>
                <div className="t-meta num">
                  {awaitingReview} awaiting review, {totalReviewed} confirmed
                </div>
                <div className="kpi-bar" aria-hidden="true">
                  <div
                    className="kpi-bar__fill"
                    style={{
                      width: `${totalReceived > 0 ? Math.min(100, totalReceived * 8) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* KPI 2: Verified Reports */}
              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span
                    className="t-label"
                    style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}
                  >
                    Verified Reports
                  </span>
                  <span
                    className="kpi-card__icon"
                    style={{ color: "var(--green)", background: "var(--green-wash)" }}
                  >
                    <ShieldCheck size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="kpi-card__value num">{totalReviewed}</span>
                  <span
                    className="t-meta num"
                    style={{ color: "var(--green)", fontWeight: 700 }}
                  >
                    ✓ {verificationRate}% verified
                  </span>
                </div>
                <div className="t-meta">
                  Crowdsourced images &amp; Meta AI Vision structured observations
                </div>
                <div className="kpi-bar" aria-hidden="true">
                  <div
                    className="kpi-bar__fill"
                    style={{ width: `${verificationRate}%`, background: "var(--green)" }}
                  />
                </div>
              </div>

              {/* KPI 3: Avg. Triage Turnaround */}
              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span
                    className="t-label"
                    style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}
                  >
                    Avg. Response Time
                  </span>
                  <span
                    className="kpi-card__icon"
                    style={{ color: "var(--tide)", background: "var(--tide-wash)" }}
                  >
                    <Clock size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="kpi-card__value num">
                    14 <span style={{ fontSize: "var(--step-1)", fontWeight: 600 }}>min</span>
                  </span>
                  <span
                    className="t-meta num"
                    style={{ color: "var(--tide)", fontWeight: 700 }}
                  >
                    ↘ −6m vs avg
                  </span>
                </div>
                <div className="t-meta">
                  From photo upload &amp; AI pre-triage to human reviewer sign-off
                </div>
                <div className="kpi-bar" aria-hidden="true">
                  <div className="kpi-bar__fill" style={{ width: "68%" }} />
                </div>
              </div>

              {/* KPI 4: High Priority Alerts */}
              <div className="kpi-card">
                <div className="kpi-card__top">
                  <span
                    className="t-label"
                    style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}
                  >
                    High Priority Alerts
                  </span>
                  <span
                    className="kpi-card__icon"
                    style={{ color: "var(--brick-ink)", background: "var(--brick-wash)" }}
                  >
                    <AlertTriangle size={18} aria-hidden="true" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    className="kpi-card__value num"
                    style={{ color: highPriorityCount > 0 ? "var(--brick-ink)" : "var(--ink)" }}
                  >
                    {highPriorityCount}
                  </span>
                  <span
                    className="t-meta num"
                    style={{ color: "var(--brick-ink)", fontWeight: 700 }}
                  >
                    Immediate Action
                  </span>
                </div>
                <div className="t-meta">
                  Requires reviewer sign-off · {totalUnlocated + totalFailed} unlocated/retry
                </div>
                <div className="kpi-bar" aria-hidden="true">
                  <div
                    className="kpi-bar__fill"
                    style={{
                      width: `${Math.min(100, Math.max(30, highPriorityCount * 20))}%`,
                      background: "var(--brick)",
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Main Interactive Command Hub Workspace */}
          <DashboardCommandWorkspace
            reports={recent}
            streamItems={streamItems}
            eventName={activeEvent?.event_name}
            canReview={canReview}
            totalReceived={totalReceived}
          />

          {/* Quick Actions Hub (F1–F4) */}
          <QuickActionsHub canReview={canReview} disableGlobalHotkeys />
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
