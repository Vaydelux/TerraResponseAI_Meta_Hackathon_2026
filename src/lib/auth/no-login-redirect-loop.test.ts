import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261103090000_authenticated_core_read_grants.sql", "utf8");
const appLayout = readFileSync("src/app/(app)/layout.tsx", "utf8");
const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");

describe("authenticated profile access never loops between login and dashboard", () => {
  it("grants only SELECT on RLS-protected core tables", () => {
    for (const table of ["profiles", "events", "event_members"]) {
      expect(sql).toContain(`grant select on public.${table} to authenticated;`);
    }
    const statements = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/grant\s+(?:select|all).*\s+to\s+(?:anon|public)\s*;/i);
    expect(statements).not.toMatch(/disable row level security|bypassrls/i);
    expect(statements).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
  it("separates a missing profile from an unauthenticated session", () => {
    expect(appLayout).toContain('if (!ctx) {');
    expect(appLayout).toContain('redirect("/account-unavailable")');
    expect(dashboard).toContain('if (!ctx) redirect("/account-unavailable")');
    expect(middleware).toContain('"/account-unavailable"');
  });
  it("never automatically redirects a login page into a protected-route loop", () => {
    expect(middleware).not.toContain('if (pathname === "/login")');
    expect(middleware).toContain("if (isPublicRoute(pathname))");
  });
});
