import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { PageHeader } from "@/components/layout/PageHeader";
import { adminRoleDatabase, isRoleManagementEnabled } from "@/lib/admin/role-management";
import { assignUserRole } from "./actions";

export const metadata = { title: "User roles | TerraResponse AI" };
export default async function UserRoleAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  if (!isRoleManagementEnabled()) redirect("/dashboard");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fadmin%2Fusers");
  const ctx = await getAuthContext(user);
  if (!ctx || ctx.user.role!=="admin") redirect("/dashboard");

  const db = adminRoleDatabase();
  const { data, error } = await db
    .from("profiles")
    .select("id,email,name,role,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const result = (await searchParams).result;

  const accounts = data ?? [];
  const adminCount = accounts.filter((a) => a.role === "admin").length;
  const reviewerCount = accounts.filter((a) => a.role === "reviewer").length;
  const reporterCount = accounts.filter((a) => a.role === "reporter").length;

  return (
    <section className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Manage User Roles & Clearance"
        subtitle="Only authorized administrators can promote or demote accounts. All changes are audited."
      />

      {result === "updated" && (
        <p role="status" className="panel" style={{ borderColor: "var(--green)", background: "var(--green-wash)" }}>
          Role updated successfully.
        </p>
      )}
      {result === "invalid" && (
        <p role="alert" className="panel" style={{ borderColor: "var(--amber)", background: "var(--amber-wash)" }}>
          Cannot modify your own role, or the submitted role was invalid.
        </p>
      )}
      {result === "failed" && (
        <p role="alert" className="panel" style={{ borderColor: "var(--brick)", background: "var(--brick-wash)" }}>
          The role change was denied or unavailable. No change was confirmed.
        </p>
      )}

      {/* Command Hub Role Distribution KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Total Accounts</span>
          </div>
          <div className="kpi-card__value num">{accounts.length}</div>
          <div className="kpi-card__sub">Provisioned in public.profiles</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Administrators</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {adminCount}
          </div>
          <div className="kpi-card__sub">Full RBAC &amp; spend ceiling control</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Reviewers / Moderators</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--amber-ink)" }}>
            {reviewerCount}
          </div>
          <div className="kpi-card__sub">Authorized for human verification gate</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Field Reporters</span>
          </div>
          <div className="kpi-card__value num">{reporterCount}</div>
          <div className="kpi-card__sub">Evidence intake contributors</div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="panel">
          Users could not be loaded.
        </div>
      ) : (
        <div className="tr-stack">
          <p className="t-meta" style={{ margin: 0 }}>
            Global permissions apply throughout the application. Event-specific memberships are synchronized in the community intake.
          </p>
          {accounts.map((row) => (
            <article
              className="panel"
              key={row.id}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>{row.name || "Account"}</h2>
                  <span
                    className="t-meta num"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background:
                        row.role === "admin"
                          ? "var(--tide-wash)"
                          : row.role === "reviewer"
                          ? "var(--amber-wash)"
                          : "var(--sheet-sunk)",
                      color:
                        row.role === "admin"
                          ? "var(--tide)"
                          : row.role === "reviewer"
                          ? "var(--amber-ink)"
                          : "var(--ink-2)",
                    }}
                  >
                    {row.role}
                  </span>
                </div>
                <p className="t-meta" style={{ margin: 0 }}>
                  {row.email}
                </p>
                <p className="t-meta" style={{ margin: 0 }}>
                  Current role: {row.role}
                </p>
              </div>
              {row.id === user.id ? (
                <p className="t-meta" style={{ margin: 0 }}>
                  Your account — cannot self-modify
                </p>
              ) : (
                <form
                  action={assignUserRole}
                  style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <input type="hidden" name="userId" value={row.id} />
                  <label className="t-meta" htmlFor={`role-${row.id}`}>
                    New role
                  </label>
                  <select
                    id={`role-${row.id}`}
                    name="role"
                    className="select"
                    defaultValue={row.role}
                    aria-label={`Role for ${row.name || row.email}`}
                    style={{ width: "auto", minWidth: 190 }}
                  >
                    <option value="reporter">Reporter</option>
                    <option value="reviewer">Reviewer / Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" className="btn btn--primary">
                    Save role
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
