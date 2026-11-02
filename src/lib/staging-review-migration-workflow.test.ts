import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/staging-install-review-tx.yml", "utf8");

describe("protected staging review migration installer", () => {
  it("never starts automatically and requires a protected staging environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("INSTALL-REVIEW-STAGING-ONLY");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
  });

  it("refuses production and checks exact staging DB identity including TLS", () => {
    expect(workflow).toContain('const knownProd = "ywopsafppyykhwrejliz"');
    expect(workflow).toContain('const isolated = "ytfaetqvtbsbmcsdlkvk"');
    expect(workflow).toContain('ref === prod || ref === knownProd');
    expect(workflow).toContain('u.searchParams.get("sslmode") !== "require"');
    expect(workflow).toContain('u.port !== "5432"');
  });

  it("executes only approved migration 0010 with fail-fast transactional psql", () => {
    expect(workflow).toContain("STAGING_DATABASE_URL");
    expect(workflow).toContain("--single-transaction");
    expect(workflow).toContain("-v ON_ERROR_STOP=1");
    expect(workflow).toContain("-f supabase/migrations/0010_atomic_review_actions.sql");
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain("supabase migration repair");
  });

  it("checks RLS-facing RPC privileges without outputting credentials", () => {
    expect(workflow).toContain("has_function_privilege('anon'");
    expect(workflow).toContain("has_function_privilege('authenticated'");
    expect(workflow).toContain('state" != "true|true|true|true"');
    expect(workflow).not.toMatch(/echo.*STAGING_DATABASE_URL/);
  });
});
