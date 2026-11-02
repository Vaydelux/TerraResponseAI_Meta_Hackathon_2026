import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/provision-staging-test-users.ts", "utf8");
const workflow = readFileSync(".github/workflows/provision-staging-test-users.yml", "utf8");

describe("three staging QA identities", () => {
  it("requires an exact staging ref, production denylist and manual confirmation", () => {
    expect(script).toContain('ref !== "ytfaetqvtbsbmcsdlkvk"');
    expect(script).toContain('production !== "ywopsafppyykhwrejliz"');
    expect(script).toContain('"CREATE-STAGING-TEST-USERS"');
    expect(script).toContain("inputRef !== ref");
    expect(script).toContain("url !== `https://${ref}.supabase.co`");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).not.toContain("push:");
  });

  it("uses Supabase Auth Admin, not direct auth schema inserts", () => {
    expect(script).toContain("supabase.auth.admin.createUser");
    expect(script).toContain("email_confirm: true");
    expect(script).not.toContain("insert into auth.users");
    expect(script).toContain("new Set(entries.map(x => x.password)).size !== 3");
    for (const role of ["reporter", "reviewer", "admin"]) {
      expect(script).toContain(`qa.${role}@example.com`);
      expect(script).toContain(`role: "${role}"`);
    }
    expect(workflow).toContain("STAGING_SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("creates one shared staging event with correct memberships", () => {
    expect(script).toContain('slug: "hackathon-qa-roles"');
    expect(script).toContain('name: "QA Demo — Three Roles"');
    expect(script).toContain('role: "contributor"');
    expect(script).toContain('role: "reviewer"');
    expect(script).toContain('role: "coordinator"');
    expect(script).toContain('.from("event_members")');
    expect(script).toContain("memberships?.length !== expectedMemberships.length");
    expect(script).toContain("created_by: adminUserId");
  });

  it("compensates for partial creation in FK-safe order", () => {
    const eventDelete = script.indexOf('supabase.from("events").delete()');
    const accountDelete = script.indexOf("supabase.auth.admin.deleteUser(id)");
    expect(eventDelete).toBeGreaterThan(0);
    expect(accountDelete).toBeGreaterThan(eventDelete);
    expect(script).not.toContain("deleteUser(entry.email");
  });
});
