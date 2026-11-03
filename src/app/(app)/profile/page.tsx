// src/app/(app)/profile/page.tsx
//
// The profile page. Light touch — a simple panel with the user's
// profile + role permissions. Uses the new design-system panel.

import Link from "next/link";
import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventSwitcher } from "@/components/layout/EventSwitcher";
import { Panel } from "@/components/ui-tr/Panel";
import { SealBadge } from "@/components/seal/SealBadge";
import { stateFromReport } from "@/lib/design/status";
import { formatRelativeTime } from "@/lib/design/format";
import { toNavRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  REPORTER: "Reporter",
  REVIEWER: "Reviewer",
  ADMIN: "Admin",
};

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  REPORTER: [
    "Upload disaster photos",
    "View your own submissions",
    "Track review status",
    "Request evidence deletion",
  ],
  REVIEWER: [
    "Everything a Reporter can do",
    "Access the review queue",
    "Confirm, correct, flag, or reject reports",
    "Read the audit log",
  ],
  ADMIN: [
    "Everything a Reviewer can do",
    "Purge evidence after the retention window",
    "Override priority scores",
    "View the AI spend ceilings",
  ],
};

export default async function ProfilePageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/profile"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/profile"));

  const supabase = await createSupabaseServerClient();
  const { data: ownReports } = await supabase
    .from("reports")
    .select("id, title, status, review_outcome, uploaded_at")
    .eq("creator_id", user.id)
    .order("uploaded_at", { ascending: false })
    .range(0, 9);

  const role = toNavRole(ctx.user.role);
  const submissions = (ownReports ?? []) as unknown as Array<{
    id: string;
    title: string | null;
    status: string;
    review_outcome: string | null;
    uploaded_at: string;
  }>;
  const confirmedCount = submissions.filter(
    (s) => s.status === "reviewed" && s.review_outcome === "confirmed",
  ).length;

  return (
    <div className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Operator Profile & Clearance"
        subtitle="Your account identity, RBAC role permissions, and recent field submission history."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
            {ctx.events.length > 0 && <EventSwitcher events={ctx.events} />}
            <Link href="/reports/new" className="btn btn--primary">
              Upload a photo
            </Link>
          </div>
        }
      />

      {/* Command Hub Operator KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Clearance Role</span>
          </div>
          <div className="kpi-card__value" style={{ fontSize: "var(--step-2)", color: "var(--tide)" }}>
            {ROLE_LABEL[role]}
          </div>
          <div className="kpi-card__sub">RLS-enforced server identity</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Recent Submissions</span>
          </div>
          <div className="kpi-card__value num">{submissions.length}</div>
          <div className="kpi-card__sub">Latest 10 field evidence uploads</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Verified Reports</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--green-ink)" }}>
            {confirmedCount}
          </div>
          <div className="kpi-card__sub">Confirmed by human reviewer</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Active Workspaces</span>
          </div>
          <div className="kpi-card__value num">{ctx.events.length}</div>
          <div className="kpi-card__sub">Authorized incident sectors</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
            <span
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--r-pill)",
                background: "var(--tide)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              {(ctx.user.name || ctx.user.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>{ctx.user.name ?? "User"}</h2>
              <p className="t-meta" style={{ margin: "2px 0 0" }}>{ctx.user.email}</p>
              <span
                className="t-label"
                style={{
                  marginTop: 6,
                  padding: "2px 8px",
                  borderRadius: "var(--r-pill)",
                  background: "var(--tide-wash)",
                  color: "var(--tide)",
                  display: "inline-block",
                  fontSize: "var(--step--1)",
                }}
              >
                {ROLE_LABEL[role]}
              </span>
            </div>
          </div>
          <p className="t-meta" style={{ marginTop: "var(--s-4)" }}>
            Signed in via Supabase Auth. Your session is a signed JWT. Role-based
            access control is enforced at the application layer (RLS-equivalent).
          </p>
        </Panel>

        <Panel>
          <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Permissions</h3>
          <ul style={{ display: "grid", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }}>
            {ROLE_PERMISSIONS[role].map((p) => (
              <li key={p} style={{ display: "grid", gridTemplateColumns: "12px 1fr", gap: "var(--s-2)", alignItems: "start" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, marginTop: 8, borderRadius: "var(--r-pill)", background: "var(--tide)" }} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <section style={{ marginTop: "var(--s-2)" }}>
        <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Your submissions</h3>
        {submissions.length > 0 ? (
          <ul style={{ display: "grid", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }}>
            {submissions.map((row) => {
              const state = stateFromReport({
                status: row.status,
                reviewOutcome: row.review_outcome,
              });
              return (
                <li
                  key={row.id}
                  className="panel"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--s-3)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", flexWrap: "wrap" }}>
                    <SealBadge state={state} />
                    <div>
                      <Link
                        href={`/reports/${row.id}`}
                        style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}
                      >
                        {row.title || `Report ${row.id.slice(0, 8)}`}
                      </Link>
                      <div className="t-meta num">
                        #{row.id.slice(0, 8)} · {row.status.replace(/_/g, " ")}
                        {row.review_outcome ? ` · ${row.review_outcome}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                    <span className="t-meta num" title={new Date(row.uploaded_at).toLocaleString()}>
                      {formatRelativeTime(row.uploaded_at)}
                    </span>
                    <Link href={`/reports/${row.id}`} className="btn btn--sm">
                      Open report
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="panel">
            <p className="t-meta" style={{ margin: 0 }}>
              You have not submitted any reports yet.{" "}
              <Link href="/reports/new" style={{ color: "var(--tide)", fontWeight: 600 }}>
                Upload a photo →
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
