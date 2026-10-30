// src/app/(app)/profile/page.tsx
//
// The profile page. Light touch — a simple panel with the user's
// profile + role permissions. Uses the new design-system panel.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui-tr/Panel";
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

  // Fetch the user's own reports so we can show a small submission
  // history (light touch — the brief said "light touch" for the
  // profile).
  const supabase = await createSupabaseServerClient();
  const { data: ownReports } = await supabase
    .from("reports")
    .select("id, status, review_outcome, uploaded_at")
    .eq("creator_id", user.id)
    .order("uploaded_at", { ascending: false })
    .range(0, 9);

  const role = toNavRole(ctx.user.role);

  return (
    <div className="tr-page">
      <PageHeader
        title="Profile"
        subtitle="Your account, role permissions, and submission history."
      />
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
              <h2 style={{ fontSize: "var(--step-1)" }}>{ctx.user.name ?? "User"}</h2>
              <p className="t-meta">{ctx.user.email}</p>
              <span
                className="t-label"
                style={{
                  marginTop: 4,
                  padding: "2px 8px",
                  borderRadius: "var(--r-pill)",
                  background: "var(--sheet-sunk)",
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

      <section style={{ marginTop: "var(--s-5)" }}>
        <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Your submissions</h3>
        {ownReports && ownReports.length > 0 ? (
          <ul style={{ display: "grid", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }}>
            {ownReports.map((r) => {
              const row = r as unknown as { id: string; status: string; review_outcome: string | null; uploaded_at: string };
              return (
                <li key={row.id} className="report-row" style={{ textDecoration: "none", color: "inherit" }}>
                  <a href={`/reports/${row.id}`} className="t-label" style={{ color: "var(--tide)", fontWeight: 700 }}>
                    {row.id.slice(0, 8)}
                  </a>
                  <span className="t-meta" style={{ textTransform: "capitalize" }}>
                    {row.status.replace(/_/g, " ")}{row.review_outcome ? ` · ${row.review_outcome}` : ""}
                  </span>
                  <span className="t-meta">{new Date(row.uploaded_at).toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="t-meta">You have not submitted any reports yet. <a href="/reports/new">Upload a photo →</a></p>
        )}
      </section>
    </div>
  );
}
