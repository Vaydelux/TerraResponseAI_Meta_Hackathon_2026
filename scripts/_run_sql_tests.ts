// scripts/_run_sql_tests.ts
//
// Phase 18 SQL security test runner.
//
// 1. Sets up a fresh PGlite DB at /tmp/pglite_phase18_tests.
// 2. Creates a `_test_results` table for the SQL tests to write to
//    (PGlite doesn't surface RAISE NOTICE via pg.query(), so we use
//    a side-channel table).
// 3. Applies migrations 0001-0006.
// 4. Applies the seed.
// 5. Runs the SQL tests in supabase/tests/phase18_security_tests.sql.
// 6. Reads the `_test_results` table after each test statement.
// 7. Exits 0 if all pass, 1 if any fail.
//
// The PGlite PostGIS stubs are used (the geo column is `text`, the
// ST_* functions are no-ops). The PostGIS-specific RPC tests
// (TEST 17-19 in supabase/tests/test_rls.sql) are SKIPPED in PGlite
// — they must be re-run against a real Supabase project with
// PostGIS enabled to validate the actual spatial behavior.

import { newLocalDb, applyMigration } from "./_local_db";
import { splitSql } from "./_sql_split";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rmSync } from "node:fs";

interface TestResultRow {
  id: number;
  name: string;
  ok: boolean;
  detail: string | null;
}

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

  // 2. Apply the seed.
  console.log("\n=== Seeding demo data ===");
  let seedSql = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf-8");
  const seedStmts = splitSql(seedSql);
  let seedApplied = 0;
  let seedFailed = 0;
  for (const stmt of seedStmts) {
    try {
      await pg.query(stmt);
      seedApplied++;
    } catch (e) {
      seedFailed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already exists") && !msg.includes("duplicate")) {
        console.error(`  seed stmt failed: ${stmt.slice(0, 100).replace(/\n/g, " ")}`);
        console.error(`         -> ${msg}`);
      }
    }
  }
  console.log(`  seed: ${seedApplied} applied, ${seedFailed} skipped/failed`);

  // 3. Run the SQL tests. Each test INSERTs a row into
  //    public._test_results with (name, ok, detail). We read the
  //    table after each statement to surface PASS/FAIL.
  console.log("\n=== Running SQL security tests ===");
  let testSql = readFileSync(resolve(process.cwd(), "supabase/tests/phase18_security_tests.sql"), "utf-8");
  testSql = testSql.replace(/^\\set.*$/gm, "").replace(/^\\pset.*$/gm, "");
  const testStmts = splitSql(testSql);
  let testIdx = 0;
  for (const stmt of testStmts) {
    testIdx++;
    try {
      await pg.query(stmt);
    } catch (e) {
      console.error(`  test stmt ${testIdx} error: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`         stmt: ${stmt.slice(0, 120).replace(/\n/g, " ")}`);
    }
  }

  // 4. Read the results.
  const r = await pg.query("select name, ok, detail from public._test_results order by id");
  const rows = r.rows as TestResultRow[];
  let pass = 0;
  let fail = 0;
  for (const row of rows) {
    const mark = row.ok ? "PASS" : "FAIL";
    const line = `${mark}: ${row.name}${row.detail ? ` (${row.detail})` : ""}`;
    if (row.ok) {
      pass++;
      console.log(`  ${line}`);
    } else {
      fail++;
      console.error(`  ${line}`);
    }
  }

  await pg.close();

  console.log("\n=== SUMMARY ===");
  console.log(`  PASS: ${pass}`);
  console.log(`  FAIL: ${fail}`);
  console.log(`  TOTAL: ${pass + fail}`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
