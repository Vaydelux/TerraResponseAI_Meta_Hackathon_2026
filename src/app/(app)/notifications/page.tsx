import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { createSupabaseServerClient, getServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { PageHeader } from "@/components/layout/PageHeader";
import { isTriageEnabled } from "@/lib/triage/processing";
import { formatRelativeTime } from "@/lib/design/format";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

export const metadata = { title: "Notifications | TerraResponse AI" };

export default async function NotificationsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fnotifications");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  if (!isTriageEnabled()) {
    return (
      <section className="tr-page">
        <PageHeader title="Notifications" subtitle="Notification center" />
        <div className="panel">
          <p>Community incident notifications are not enabled in this environment.</p>
        </div>
      </section>
    );
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("notifications")
    .select("id,kind,title,body,created_at,read_at,report_id")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // If the optional `notifications` table is not yet migrated or empty,
  // derive recent activity updates from the user's visible reports.
  let derivedUpdates: Array<{
    id: string;
    reportId: string;
    title: string;
    body: string;
    createdAt: string;
    status: string;
  }> = [];

  if (error || !(data ?? []).length) {
    const eventIds = ctx.events.map((e) => e.event_id);
    if (eventIds.length > 0) {
      const { data: recentReports } = await db
        .from("reports")
        .select("id, title, status, review_outcome, location_label, uploaded_at")
        .in("event_id", eventIds)
        .order("uploaded_at", { ascending: false })
        .limit(10);

      derivedUpdates = (recentReports ?? []).map((r) => {
        const row = r as unknown as {
          id: string;
          title: string | null;
          status: string;
          review_outcome: string | null;
          location_label: string | null;
          uploaded_at: string;
        };
        const isConfirmed = row.status === "reviewed" && row.review_outcome === "confirmed";
        return {
          id: `rep-notif-${row.id}`,
          reportId: row.id,
          title:
            row.title || `Report #TR-${row.id.slice(0, 6).toUpperCase()} status update`,
          body: isConfirmed
            ? `Human reviewer confirmed this report (${row.location_label || "Sector corridor"}).`
            : `Report queued in pipeline (${row.status.replaceAll("_", " ")}).`,
          createdAt: row.uploaded_at,
          status: isConfirmed ? "VERIFIED" : "PIPELINE UPDATE",
        };
      });
    }
  }

  const hasRealNotifications = !error && (data ?? []).length > 0;
  const totalNotifications = hasRealNotifications
    ? (data ?? []).length
    : derivedUpdates.length;
  const unreadCount = hasRealNotifications
    ? (data ?? []).filter((n) => !n.read_at).length
    : derivedUpdates.length;
  const verifiedUpdatesCount = hasRealNotifications
    ? (data ?? []).filter((n) => String(n.kind).includes("confirm") || String(n.kind).includes("review")).length
    : derivedUpdates.filter((u) => u.status === "VERIFIED").length;

  return (
    <section className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Notifications & Activity Inbox"
        subtitle="Audit-linked incident and moderation activity visible to your account."
        actions={
          !error &&
          (data ?? []).some((n) => !n.read_at) && (
            <form action={markAllNotificationsRead}>
              <button className="btn" type="submit">
                Mark all as read
              </button>
            </form>
          )
        }
      />

      {/* Command Hub Notification KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Total Activity Alerts</span>
          </div>
          <div className="kpi-card__value num">{totalNotifications}</div>
          <div className="kpi-card__sub">RLS-scoped moderation &amp; cluster notifications</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Unread Inbox</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--amber-ink)" }}>
            {unreadCount}
          </div>
          <div className="kpi-card__sub">New pipeline &amp; thread updates</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Verified Outcomes</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {verifiedUpdatesCount}
          </div>
          <div className="kpi-card__sub">Human-reviewed status transitions</div>
        </div>
      </div>

      {!error && (data ?? []).length > 0 ? (
        <div className="tr-stack">
          {(data ?? []).map((n) => (
            <article
              key={n.id}
              className="panel"
              aria-label={n.kind.replaceAll("_", " ")}
              style={{ display: "grid", gap: 8 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  className="t-meta num"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: n.read_at ? "var(--ink-2)" : "var(--tide)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {n.read_at ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : (
                    <Clock size={14} aria-hidden="true" />
                  )}
                  <span>{n.kind.replaceAll("_", " ")}</span>
                </span>
                <span className="t-meta num">
                  {new Date(n.created_at).toLocaleString()} ·{" "}
                  {n.read_at ? "Read" : "Unread"}
                </span>
              </div>
              <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>{n.title}</h2>
              <p className="t-meta" style={{ margin: 0 }}>
                {n.body}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                {n.report_id && (
                  <Link href={`/reports/${n.report_id}`} className="btn btn--sm">
                    Open report
                  </Link>
                )}
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button className="btn btn--sm" type="submit">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : derivedUpdates.length > 0 ? (
        <div className="tr-stack">
          {derivedUpdates.map((item) => (
            <article
              key={item.id}
              className="panel"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--s-4)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div
                  className="t-meta num"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ color: "var(--tide)", fontWeight: 700 }}>
                    {item.status}
                  </span>
                  <span>·</span>
                  <span>{formatRelativeTime(item.createdAt)}</span>
                </div>
                <h2 style={{ fontSize: "var(--step-0)", margin: 0 }}>{item.title}</h2>
                <p className="t-meta" style={{ margin: 0 }}>
                  {item.body}
                </p>
              </div>
              <Link href={`/reports/${item.reportId}`} className="btn btn--sm">
                <span>Open Report</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={18} aria-hidden="true" style={{ color: "var(--tide)" }} />
            <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>No notifications yet</h2>
          </div>
          <p className="t-meta" style={{ margin: 0 }}>
            When your submitted reports are analyzed by Meta AI Vision or verified by a human
            reviewer, updates will appear here.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/reports/new" className="btn btn--primary btn--sm">
              Upload a photo
            </Link>
            <Link href="/dashboard" className="btn btn--sm">
              Return to Overview
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
