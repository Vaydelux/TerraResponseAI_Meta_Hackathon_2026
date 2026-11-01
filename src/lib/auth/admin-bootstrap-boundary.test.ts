import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("first administrator privilege boundary", () => {
  it("never exposes bootstrap or service-role account promotion as a browser Server Action", () => {
    const actions = readFileSync("src/lib/auth/actions.ts", "utf8");
    expect(actions).not.toMatch(/export\s+(?:async\s+)?function\s+bootstrapFirstAdminAction/);
    expect(actions).not.toContain('update({ role: "admin" })');
    expect(actions).not.toContain(".eq(\"role\", \"admin\")");
  });

  it("requires an owner-controlled CLI for the one-time administrator bootstrap", () => {
    const cli = readFileSync("scripts/bootstrap-admin.ts", "utf8");
    expect(cli).toContain("process.argv[2]");
    expect(cli).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(cli).toContain('eq("role", "admin")');
    expect(cli).toContain('update({ role: "admin" })');
    expect(cli).toContain("promoted?.length !== 1");
    expect(cli).not.toContain('"use server"');
  });
});
