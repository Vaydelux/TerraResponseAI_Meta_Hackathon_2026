import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const get = (name: string) => readFileSync(name, "utf8");
const apply = get(".github/workflows/supabase-staging-apply.yml");
const preview = get(".github/workflows/supabase-staging-preview.yml");
const verify = get(".github/workflows/staging-integration-verification.yml");
const provision = get("scripts/provision-staging-test-users.ts");
const grants = get("supabase/migrations/0011_explicit_data_api_grants.sql");
const rpc = get("supabase/migrations/0012_restrict_definer_rpc_access.sql");

describe("staging isolation hardening", () => {
  it("refuses the production project even with overridden staging inputs", () => {
    for (const workflow of [apply, preview, verify]) {
      expect(workflow).toContain('"ywopsafppyykhwrejliz"');
      expect(workflow).toContain("PRODUCTION_PROJECT_REF");
      expect(workflow).toContain("exit 1");
    }
    expect(provision).toContain('ref !== "ytfaetqvtbsbmcsdlkvk"');
    expect(provision).toContain('production !== "ywopsafppyykhwrejliz"');
  });
  it("uses distinct staging-only credentials and never accidentally reuses production secrets", () => {
    for (const workflow of [apply, verify]) {
      expect(workflow).toContain("secrets.STAGING_SUPABASE_URL");
      expect(workflow).toContain("secrets.STAGING_SUPABASE_ANON_KEY");
      expect(workflow).toContain("secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY");
      expect(workflow).not.toContain("secrets.NEXT_PUBLIC_SUPABASE_URL");
      expect(workflow).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    }
    expect(apply).toContain("supabase db push --dry-run --linked");
    expect(apply).toContain("node scripts/prepare-staging-migration-workspace.mjs");
    expect(apply).toContain('working-directory: ${{ env.STAGING_MIGRATION_WORKSPACE }}');
    const stagingWorkspace = get("scripts/prepare-staging-migration-workspace.mjs");
    expect(stagingWorkspace).toContain('"ytfaetqvtbsbmcsdlkvk"');
    expect(stagingWorkspace).toContain('"ywopsafppyykhwrejliz"');
    expect(stagingWorkspace).toContain("Unknown, non-timestamped or out-of-order migration");
    expect(apply).toContain("environment: staging");
  });
});

describe("safe follow-on PostgreSQL permissions", () => {
  it("never grants table-wide report UPDATE to authenticated", () => {
    expect(grants).not.toMatch(/grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+public\.reports\s+to\s+authenticated/i);
    expect(grants).toMatch(/revoke\s+update\s+on\s+public\.reports\s+from\s+authenticated/i);
    expect(grants).toMatch(/grant\s+update\s*\([\s\S]*?\)\s+on\s+public\.reports\s+to\s+authenticated/i);
    expect(grants).not.toContain("grant usage, select on all sequences in schema public to authenticated");
  });
  it("grants resilience tables only the privileges each API route needs", () => {
    expect(grants).toMatch(/grant select on public\.ai_usage_log to authenticated/);
    expect(grants).toMatch(/revoke insert, update, delete on public\.ai_usage_log from public, anon, authenticated/);
    expect(grants).toMatch(/drop policy if exists ai_usage_log_insert_authenticated/);
    expect(grants).toMatch(/grant insert \(user_id, report_id, kind, ttl_seconds\)\s+on public\.evidence_signed_url_log to authenticated/);
    expect(grants).toMatch(/grant insert \(report_id, retention_state, retention_window_ends_at, reason, requested_by\)\s+on public\.report_retention to authenticated/);
    expect(grants).toMatch(/grant update \([\s\S]*?\) on public\.report_retention to authenticated/);
    expect(grants).not.toMatch(/grant select, insert, update, delete on public\.report_retention to authenticated/);
    expect(grants).toMatch(/public\.ai_usage_log, public\.evidence_signed_url_log, public\.report_retention\s+to service_role/);
  });
  it("restricts public privileged RPCs and protects cross-user membership", () => {
    expect(rpc).toContain("p_user_id = auth.uid() or public.is_admin()");
    expect(rpc).toContain("where n.nspname = 'public' and p.prosecdef");
    expect(rpc).toContain("from public, anon, authenticated");
    expect(rpc).toContain("to authenticated, service_role");
    expect(rpc).toContain("alter function public.set_updated_at()");
  });
});

describe("safe staging migration preflight", () => {
  it("does not blindly drop provider-owned auth triggers", () => {
    const sql = get("supabase/migrations/0007_fix_auth_trigger.sql");
    expect(sql).toContain("legacy_function <> app_function");
    expect(sql).toContain("desired_function <> app_function");
    expect(sql).toContain("Refusing to drop auth.users.on_auth_user_created");
    expect(sql).toContain("Refusing to replace auth.users.trg_handle_new_user");
    expect(sql).not.toContain("drop trigger if exists on_auth_user_created on auth.users;");
    expect(sql).not.toContain("drop trigger if exists trg_handle_new_user on auth.users;");
  });

  it("compares migration versions instead of full filenames", () => {
    const verifier = get("scripts/verify-supabase.ts");
    expect(verifier).toContain("migrationHistoryVerified");
    expect(verifier).toContain("appliedSet.has(migrationVersion(f))");
    expect(verifier).not.toContain("appliedSet.has(stem)");
    expect(verifier).toContain('record("remote migration status", "UNVERIFIED", false');
  });

  it("reports Data API migration-history failures as unverified, never a fresh project", () => {
    const verifier = get("scripts/verify-supabase.ts");
    expect(verifier).toContain('record("applied-migrations table readable", "UNVERIFIED", false');
    expect(verifier).not.toContain('supabase_migrations.schema_migrations not present yet (fresh project');
  });
});
