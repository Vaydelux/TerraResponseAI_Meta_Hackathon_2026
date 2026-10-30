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
    expect(provision).toContain('ref === "ywopsafppyykhwrejliz"');
    expect(provision).toContain('!/^[a-z0-9]{12,32}$/.test(production)');
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
  it("restricts public privileged RPCs and protects cross-user membership", () => {
    expect(rpc).toContain("p_user_id = auth.uid() or public.is_admin()");
    expect(rpc).toContain("where n.nspname = 'public' and p.prosecdef");
    expect(rpc).toContain("from public, anon, authenticated");
    expect(rpc).toContain("to authenticated, service_role");
    expect(rpc).toContain("alter function public.set_updated_at()");
  });
});
