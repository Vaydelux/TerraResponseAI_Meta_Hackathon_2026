import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/supabase-staging-preview.yml", "utf8");

describe("Supabase staging preview safety", () => {
  it("is manual-only, pinned, and uses the explicit linked staging target", () => {
    expect(workflow).toContain("workflow_dispatch:");
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

  it("warns on unsupported filename versions without touching remote migration history", () => {
    expect(workflow).toContain("Nonstandard migration filename");
    expect(workflow).toContain("Do not rename an already applied migration");
  });
});
