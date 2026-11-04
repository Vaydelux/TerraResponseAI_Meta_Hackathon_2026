import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const migration=readFileSync("supabase/migrations/20261103122000_admin_role_management.sql","utf8");
const action=readFileSync("src/app/(app)/admin/users/actions.ts","utf8");
const page=readFileSync("src/app/(app)/admin/users/page.tsx","utf8");
const sidebar=readFileSync("src/components/layout/WorkspaceSidebar.tsx","utf8");
const helper=readFileSync("src/lib/admin/role-management.ts","utf8");

describe("admin role governance",()=>{
  it("cannot be invoked by public, anon, or authenticated browser roles",()=>{
    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke all on function public.assign_app_role(uuid,uuid,text)");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role;");
    expect(helper).toContain("serviceRoleKey()");
    expect(helper).toContain('process.env.REPORT_FIRST_ROLE_MANAGEMENT_ENABLED === "true"');
  });
  it("requires active admin JWT role at the route and again transactionally",()=>{
    expect(action).toContain('ctx.user.role!=="admin"');
    expect(action).toContain("p_actor:user.id");
    expect(migration).toContain("v_actor_role is distinct from 'admin'");
    expect(migration).toContain("pg_advisory_xact_lock");
  });
  it("prevents self changes and demoting the last admin",()=>{
    expect(action).toContain("parsed.data.userId===user.id");
    expect(migration).toContain("if p_actor = p_target then");
    expect(migration).toContain("count(*) from public.profiles where role='admin'");
    expect(migration).toContain("Cannot remove the last administrator");
  });
  it("revokes residual elevated event permissions on demotion",()=>{
    expect(migration).toContain("set role='contributor'");
    expect(migration).toContain("set role='reviewer'");
    expect(migration).toContain("slug='community-intake'");
    expect(migration).toContain("insert into public.audit_events");
    expect(migration).toContain("role_changed");
  });
  it("shows role management only to approved admins and uses server form actions",()=>{
    expect(page).toContain('ctx.user.role!=="admin"');
    expect(page).toContain('action={assignUserRole}');
    expect(sidebar).toContain('roles: ["admin"], requiresRoleManagement: true');
    expect(sidebar).toContain('(!link.requiresRoleManagement || options.showRoleManagement)');
  });
});
