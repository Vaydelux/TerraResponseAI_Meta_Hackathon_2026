import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { PageHeader } from "@/components/layout/PageHeader";
import { adminRoleDatabase, isRoleManagementEnabled } from "@/lib/admin/role-management";
import { assignUserRole } from "./actions";

export const metadata={ title:"User roles | TerraResponse AI" };
export default async function UserRoleAdminPage({
  searchParams,
}: {
  searchParams:Promise<{ result?:string }>;
}) {
  if(!isRoleManagementEnabled()) redirect("/dashboard");
  const user=await getServerUser();
  if(!user) redirect("/login?callbackUrl=%2Fadmin%2Fusers");
  const ctx=await getAuthContext(user);
  if(!ctx||ctx.user.role!=="admin") redirect("/dashboard");

  const db=adminRoleDatabase();
  const {data,error}=await db.from("profiles")
    .select("id,email,name,role,created_at")
    .order("created_at",{ascending:false}).limit(100);
  const result=(await searchParams).result;
  return <section className="tr-page">
    <PageHeader title="Manage user roles" subtitle="Only authorized administrators can promote or demote accounts. All changes are audited." />
    {result==="updated" && <p role="status" className="panel">Role updated successfully.</p>}
    {result==="invalid" && <p role="alert" className="panel">Cannot modify your own role, or the submitted role was invalid.</p>}
    {result==="failed" && <p role="alert" className="panel">The role change was denied or unavailable. No change was confirmed.</p>}
    {error ? <div role="alert" className="panel">Users could not be loaded.</div> :
    <div className="tr-stack">
      <p className="t-meta">Global permissions apply throughout the application. Event-specific memberships are synchronized in the community intake.</p>
      {(data??[]).map(row => <article className="panel" key={row.id} style={{display:"flex",gap:16,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontSize:"var(--step-1)"}}>{row.name||"Account"}</h2>
          <p className="t-meta">{row.email}</p>
          <p className="t-meta">Current role: {row.role}</p>
        </div>
        {row.id===user.id ? <p className="t-meta">Your account — cannot self-modify</p> :
          <form action={assignUserRole} style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="hidden" name="userId" value={row.id}/>
            <label className="t-meta" htmlFor={`role-${row.id}`}>New role</label>
            <select id={`role-${row.id}`} name="role" defaultValue={row.role} aria-label={`Role for ${row.name||row.email}`}>
              <option value="reporter">Reporter</option>
              <option value="reviewer">Reviewer / Moderator</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn--primary">Save role</button>
          </form>}
      </article>)}
    </div>}
  </section>;
}
