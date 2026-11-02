import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/supabase-staging-preview.yml", "utf8");

describe("Supabase staging preview safety", () => {
  it("is manual-only, pinned, and uses the explicit linked staging target", () => {
    expect(workflow).toContain("workflow_dispatch:");
    // A new commit on main provides a fresh run instead of replaying the
    // original SHA through GitHub's "Re-run jobs" action.
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("'.github/workflows/supabase-staging-preview.yml'");
    expect(workflow).toContain("version: 2.72.7");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain('supabase link --project-ref "$SUPABASE_PROJECT_REF"');
    expect(workflow).toContain("supabase migration list --linked");
    expect(workflow).toContain("supabase db push --dry-run --linked");
  });

  it("never performs an applying, repairing, seeding or reset command", () => {
    expect(workflow).not.toMatch(/run:\s*supabase db push(?![^\n]*--dry-run)/);
    expect(workflow).not.toMatch(/run:\s*supabase (?:db reset|migration repair|db seed)/);
  });

  it("matches applied remote timestamps in a disposable staging workspace", () => {
    expect(workflow).toContain("node scripts/prepare-staging-migration-workspace.mjs");
    expect(workflow).toContain("node \"$GITHUB_WORKSPACE/scripts/verify-staging-migration-history.mjs\"");
    expect(workflow).toContain("STAGING_MIGRATION_WORKSPACE");
    expect(workflow).toContain('working-directory: ${{ env.STAGING_MIGRATION_WORKSPACE }}');
    expect(workflow).not.toContain("supabase migration repair");
  });
});
