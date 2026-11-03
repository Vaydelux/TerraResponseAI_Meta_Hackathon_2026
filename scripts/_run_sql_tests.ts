// scripts/_run_sql_tests.ts
//
// Phase 18 SQL security test runner.
//
// 1. Sets up a fresh PGlite DB at /tmp/pglite_phase18_tests.
// 2. Applies the migrations and validates the local database harness.
//    (PGlite doesn't surface RAISE NOTICE via pg.query(), so we use
//    a side-channel table).
// 3. Refuses to run the SQL security suite without an explicitly provisioned
//    auth fixture. It never fabricates identities in auth.users.
//
// The PGlite PostGIS stubs are used (the geo column is `text`, the
// ST_* functions are no-ops). The PostGIS-specific RPC tests
// (TEST 17-19 in supabase/tests/test_rls.sql) are SKIPPED in PGlite
// — they must be re-run against a real Supabase project with
// PostGIS enabled to validate the actual spatial behavior.

import { newLocalDb, applyMigration } from "./_local_db";
import { rmSync } from "node:fs";

async function main() {
  const dataDir = "/tmp/pglite_phase18_tests";
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}

  const pg = await newLocalDb(dataDir);

  // 0. Create the side-channel results table.
  await pg.query("create table public._test_results (id serial primary key, name text, ok boolean, detail text)");

  // 1. Apply migrations 0001-0007.
  console.log("=== Applying migrations ===");
  for (const { file, opts } of [
    { file: "0001_schema.sql", opts: {} },
    { file: "0002_rls.sql", opts: {} },
    { file: "0003_storage.sql", opts: {} },
    { file: "0004_resilience.sql", opts: {} },
    { file: "0005_postgis.sql", opts: { skipPostgis: true } },
    { file: "0006_security_fixes.sql", opts: { skipPostgis: true } },
    { file: "0007_fix_auth_trigger.sql", opts: {} },
  ]) {
    const r = await applyMigration(pg, file, opts);
    if (r.failed > 0) {
      console.error(`FAIL: ${file} — ${r.failed} statements failed:`);
      for (const f of r.results.filter((x) => !x.ok)) {
        console.error(`  stmt ${f.index}: ${f.statement.slice(0, 100).replace(/\n/g, " ")}`);
        console.error(`         -> ${f.error}`);
      }
      await pg.close();
      process.exit(1);
    }
    console.log(`  ${file}: ${r.applied}/${r.total} applied`);
  }

  // 1b. Supabase-default grants on public.* tables to authenticated.
  console.log("\n=== Applying Supabase-default grants ===");
  const publicTables = [
    "profiles", "events", "event_members", "reports",
    "report_analyses", "review_actions", "priority_overrides",
    "audit_events", "ai_usage_log", "evidence_signed_url_log",
    "report_retention",
  ];
  for (const t of publicTables) {
    try {
      await pg.query(`grant select on public.${t} to authenticated, anon`);
      await pg.query(`grant insert on public.${t} to authenticated`);
      await pg.query(`grant update on public.${t} to authenticated`);
      await pg.query(`grant delete on public.${t} to authenticated`);
    } catch (e) {
      // ignore — table may not exist yet
    }
  }
  try {
    await pg.query("revoke update, delete, truncate on public.review_actions from authenticated");
    await pg.query("revoke update, delete, truncate on public.priority_overrides from authenticated");
    await pg.query("revoke insert, update, delete, truncate on public.audit_events from authenticated");
    await pg.query("revoke update on public.reports from authenticated");
    await pg.query("grant update (status, review_outcome, priority_score, retry_count, next_retry_at, last_error, title, description, latitude, longitude, location_source, location_label) on public.reports to authenticated");
  } catch (e) { /* ignore */ }
  console.log("  grants applied");

  // 2. Do not fabricate Supabase Auth identities in SQL. The old seed path
  // inserted preconfirmed rows into auth.users and could be mistaken for a
  // valid authentication/security test. Provision identities through the
  // protected staging Auth Admin workflow, then run the SQL suites against
  // that isolated database with direct database access.
  console.error("\n=== SQL security tests not run ===");
  console.error("No SQL seed is permitted to create auth.users identities.");
  console.error("Provision isolated staging identities through the Auth Admin API first.");
  await pg.close();
  process.exit(2);
}

main().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
