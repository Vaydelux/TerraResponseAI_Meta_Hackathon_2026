// scripts/_replay_migrations.ts
//
// Replay migrations 0001-0006 against a fresh PGlite instance and
// report which statements succeed/fail. Used by the Phase 18
// verification run to prove the migrations are valid PostgreSQL.
//
// This is a DEVELOPMENT tool, not part of the deployed app. It
// generates a disposable database at /tmp/pglite_phase18_db and
// tears it down on every run.

import { newLocalDb, applyMigration } from "./_local_db";
import { rmSync } from "node:fs";

interface FileResult {
  file: string;
  applied: number;
  total: number;
  failed: number;
  durationMs: number;
  failures: { index: number; statement: string; error: string }[];
}

async function main() {
  const dataDir = "/tmp/pglite_phase18_db";
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}

  const pg = await newLocalDb(dataDir);

  const migrations = [
    { file: "0001_schema.sql", opts: {} },
    { file: "0002_rls.sql", opts: {} },
    { file: "0003_storage.sql", opts: {} },
    { file: "0004_resilience.sql", opts: {} },
    { file: "0005_postgis.sql", opts: { skipPostgis: true } },
    { file: "0006_security_fixes.sql", opts: { skipPostgis: true } },
    { file: "0007_fix_auth_trigger.sql", opts: {} },
  ];

  const results: FileResult[] = [];
  for (const { file, opts } of migrations) {
    console.log(`\n=== ${file} ===`);
    const r = await applyMigration(pg, file, opts);
    console.log(`  applied ${r.applied}/${r.total}, ${r.failed} failures (${r.durationMs}ms)`);
    const failures = r.results
      .filter((x) => !x.ok)
      .map((x) => ({ index: x.index, statement: x.statement.slice(0, 140).replace(/\n/g, " "), error: x.error ?? "?" }));
    for (const f of failures) {
      console.log(`  FAIL stmt ${f.index}: ${f.statement}`);
      console.log(`        -> ${f.error}`);
    }
    results.push({
      file,
      applied: r.applied,
      total: r.total,
      failed: r.failed,
      durationMs: r.durationMs,
      failures,
    });
  }

  await pg.close();

  // Print summary
  console.log("\n=== SUMMARY ===");
  let allApplied = 0;
  let allFailed = 0;
  for (const r of results) {
    console.log(`  ${r.file}: ${r.applied}/${r.total} (${r.failed} failures)`);
    allApplied += r.applied;
    allFailed += r.failed;
  }
  console.log(`  TOTAL: ${allApplied} applied, ${allFailed} failed`);

  if (allFailed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Replay failed:", e);
  process.exit(1);
});
