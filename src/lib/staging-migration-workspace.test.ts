import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const staging = "ytfaetqvtbsbmcsdlkvk";
const production = "ywopsafppyykhwrejliz";

function run(
  ref = staging,
  prod = production,
) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "terraresponse-migrations-test-"));
  const destination = join(temporaryRoot, "workspace");
  try {
    const message = execFileSync(
      process.execPath,
      ["scripts/prepare-staging-migration-workspace.mjs", destination],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          RUNNER_TEMP: temporaryRoot,
          SUPABASE_PROJECT_REF: ref,
          PRODUCTION_PROJECT_REF: prod,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const migrations = readdirSync(join(destination, "supabase/migrations")).sort();
    return { message, migrations, destination, temporaryRoot };
  } catch (e) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw e;
  }
}

describe("staging connector history reconciliation", () => {
  it("reproduces all 12 installed staging timestamps without changing source", () => {
    const result = run();
    try {
      expect(result.migrations).toHaveLength(13);
      expect(result.migrations).toContain("20261103090000_authenticated_core_read_grants.sql");
      expect(result.migrations).toContain("20261101171237_terraresponse_0001_schema.sql");
      expect(result.migrations).toContain("20261102064819_terraresponse_0010_atomic_review_actions.sql");
      expect(result.migrations).toContain("20261102054445_terraresponse_0011_api_grants.sql");
      expect(result.migrations).toContain("20261102054450_terraresponse_0012_privileged_rpc_permissions.sql");
      expect(result.message).toContain("Isolated staging workspace prepared: 12");
      const original = readFileSync("supabase/migrations/0010_atomic_review_actions.sql", "utf8");
      const mapped = readFileSync(join(result.destination, "supabase/migrations/20261102064819_terraresponse_0010_atomic_review_actions.sql"), "utf8");
      expect(mapped).toBe(original);
    } finally {
      rmSync(result.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("refuses to run against production or an unrecognized project", () => {
    for (const ref of [production, "unapprovedproject123"]) {
      expect(() => run(ref)).toThrow();
    }
    expect(() => run(staging, staging)).toThrow();
  });

  it("fails closed if CLI lists a historical migration only locally", () => {
    const result = run();
    try {
      const versions = result.migrations.map(x => x.slice(0, 14));
      const output = join(result.temporaryRoot, "migration-list.txt");
      const env = {
        ...process.env,
        SUPABASE_PROJECT_REF: staging,
        PRODUCTION_PROJECT_REF: production,
      };
      writeFileSync(output, ["Local │ Remote │ Time (UTC)", ...versions.map(v => `${v} │ ${v} │ 2026-11-02`)].join("\n"));
      const success = execFileSync(process.execPath, ["scripts/verify-staging-migration-history.mjs", output], {
        cwd: process.cwd(), encoding: "utf8", env,
      });
      expect(success).toContain("Verified 12 historical staging migrations");

      writeFileSync(output, ["Local │ Remote │ Time (UTC)", ...versions.map((v, i) =>
        i === 9 ? `${v} │  │ 2026-11-02` : `${v} │ ${v} │ 2026-11-02`
      )].join("\n"));
      expect(() => execFileSync(process.execPath, ["scripts/verify-staging-migration-history.mjs", output], {
        cwd: process.cwd(), encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"],
      })).toThrow();
    } finally {
      rmSync(result.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps all push operations inside the disposable staging workspace", () => {
    const workflow = readFileSync(".github/workflows/supabase-staging-apply.yml", "utf8");
    expect(workflow).toContain("node scripts/prepare-staging-migration-workspace.mjs");
    expect(workflow).toContain('working-directory: ${{ env.STAGING_MIGRATION_WORKSPACE }}');
    expect(workflow).toContain("supabase db push --dry-run --linked");
    expect(workflow).toContain("supabase db push --linked");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("APPLY-STAGING-ONLY");
    expect(workflow).not.toMatch(/run:\s*supabase migration repair/);

    const preview = readFileSync(".github/workflows/supabase-staging-preview.yml", "utf8");
    expect(preview).toContain("node scripts/prepare-staging-migration-workspace.mjs");
    expect(preview).toContain('working-directory: ${{ env.STAGING_MIGRATION_WORKSPACE }}');
    expect(preview).toContain("supabase db push --dry-run --linked");
    expect(preview).not.toMatch(/run:\s*supabase db push --linked/);
  });
});
