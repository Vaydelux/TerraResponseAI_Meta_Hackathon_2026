import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeAuthRedirect } from "./auth/safe-redirect";

const workflow = readFileSync(".github/workflows/supabase-staging-apply.yml", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

describe("Vercel preview auth callback URL protection", () => {
  const origin = new URL("https://terraresponse-preview.vercel.app/auth/callback");
  it("permits same-origin paths and legitimate query strings", () => {
    const target = safeAuthRedirect("/review?event=demo", origin);
    expect(target.origin).toBe(origin.origin);
    expect(target.pathname).toBe("/review");
    expect(target.search).toBe("?event=demo");
  });
  it.each([
    "https://evil.example", "//evil.example", "/\\\\evil.example",
    "/\\evil.example", "javascript:alert(1)", "relative/path",
    "/\n/evil.example", "/\t/evil.example",
  ])("rejects an attacker-controlled redirect %s", (next) => {
    expect(safeAuthRedirect(next, origin).href).toBe(origin.origin + "/dashboard");
  });
});

describe("staging SQL application guardrails", () => {
  it("runs only on explicit manual dispatch and protected main environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\n\s+push:\s*\n/);
    expect(workflow).not.toMatch(/\n\s+pull_request:\s*\n/);
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain('APPLY-STAGING-ONLY');
    expect(workflow).toContain('CONFIRM_PROJECT_REF');
  });
  it("requires separately confirmed staging URL and project identity", () => {
    expect(workflow).toContain('STAGING_SUPABASE_PROJECT_REF');
    expect(workflow).toContain('PRODUCTION_PROJECT_REF');
    expect(workflow).toContain('NEXT_PUBLIC_SUPABASE_URL%/');
    expect(workflow).toContain('supabase link --project-ref "$SUPABASE_PROJECT_REF"');
  });
  it("runs read-only history and dry run before the single explicit apply", () => {
    expect(workflow).toContain("supabase migration list --linked");
    expect(workflow).toContain("supabase db push --dry-run --linked");
    expect(workflow).toContain("supabase db push --linked");
    const previewIndex = workflow.indexOf("run: supabase db push --dry-run --linked");
    const applyIndex = workflow.indexOf("run: supabase db push --linked", previewIndex + 1);
    expect(previewIndex).toBeGreaterThanOrEqual(0);
    expect(applyIndex).toBeGreaterThan(previewIndex);
    expect(workflow).not.toMatch(/run:\s*supabase db (?:reset|seed)/);
    expect(workflow).not.toMatch(/run:\s*supabase migration repair/);
  });
  it("does not allow Vercel production builds to ignore TypeScript errors", () => {
    expect(nextConfig).toContain("ignoreBuildErrors: false");
  });
});
