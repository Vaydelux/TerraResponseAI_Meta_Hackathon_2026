/**
 * Staging-only migration workspace for the connector-created history.
 *
 * DO NOT rewrite the production ledger or copy prod secrets. The existing
 * staging database has 12 fully installed migrations with timestamped
 * versions, while this repository historically names them 0001..0012.
 * Create a disposable, timestamp-aligned CLI workspace in RUNNER_TEMP.
 *
 * Future migrations must use standard Supabase timestamp filenames.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const stagingRef = "ytfaetqvtbsbmcsdlkvk";
const productionRef = "ywopsafppyykhwrejliz";

// Exactly the recorded staging versions as verified on 2026-11-02.
// The installation order differs from filename numbers for 0010-0012,
// but every object was verified as present in the staging catalog.
export const history = [
  ["0001_schema.sql", "20261101171237_terraresponse_0001_schema.sql"],
  ["0002_rls.sql", "20261101171247_terraresponse_0002_rls.sql"],
  ["0003_storage.sql", "20261101171250_terraresponse_0003_storage.sql"],
  ["0004_resilience.sql", "20261101171255_terraresponse_0004_resilience.sql"],
  ["0005_postgis.sql", "20261101171258_terraresponse_0005_postgis.sql"],
  ["0006_security_fixes.sql", "20261101171303_terraresponse_0006_security_fixes.sql"],
  ["0007_fix_auth_trigger.sql", "20261101171306_terraresponse_0007_fix_auth_trigger.sql"],
  ["0008_fix_geospatial_observation_projection.sql", "20261101171309_terraresponse_0008_fix_geospatial_observation_projection.sql"],
  ["0009_support_webp_report_uploads.sql", "20261101171313_terraresponse_0009_support_webp_report_uploads.sql"],
  ["0010_atomic_review_actions.sql", "20261102064819_terraresponse_0010_atomic_review_actions.sql"],
  ["0011_explicit_data_api_grants.sql", "20261102054445_terraresponse_0011_api_grants.sql"],
  ["0012_restrict_definer_rpc_access.sql", "20261102054450_terraresponse_0012_privileged_rpc_permissions.sql"],
];

export function main() {
  if (
    process.env.SUPABASE_PROJECT_REF !== stagingRef ||
    process.env.PRODUCTION_PROJECT_REF !== productionRef ||
    process.env.SUPABASE_PROJECT_REF === process.env.PRODUCTION_PROJECT_REF
  ) throw new Error("Refusing to prepare migrations for an unapproved/non-staging project.");

  const dest = process.argv[2];
  const temporaryRoot = resolve(process.env.RUNNER_TEMP || tmpdir());
  if (!dest || !isAbsolute(dest) || !resolve(dest).startsWith(temporaryRoot + sep)) {
    throw new Error("Destination must be an absolute path within the ephemeral runner temporary directory.");
  }

  const local = resolve("supabase/migrations");
  const config = resolve("supabase/config.toml");
  if (!existsSync(config)) throw new Error("Missing Supabase CLI configuration.");
  const currentSqlFiles = readdirSync(local).filter((x) => x.endsWith(".sql")).sort();
  const legacy = new Set(history.map(([name]) => name));
  const mapped = new Set(history.map(([,name]) => name));
  const maxHistoricalVersion = "20261102064819";
  const future = [];

  for (const name of currentSqlFiles) {
    if (legacy.has(name)) continue;
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name) ||
        name.slice(0, 14) <= maxHistoricalVersion || mapped.has(name)) {
      throw new Error("Unknown, non-timestamped or out-of-order migration: " + basename(name));
    }
    future.push(name);
  }
  if (legacy.size !== 12 || ![...legacy].every((x) => currentSqlFiles.includes(x))) {
    throw new Error("Required historical migration file missing; refuse to construct incomplete staging history.");
  }

  const destRoot = resolve(dest);
  const destMigrations = join(destRoot, "supabase/migrations");
  mkdirSync(destMigrations, { recursive: true });
  copyFileSync(config, join(destRoot, "supabase/config.toml"));
  for (const [src, stamped] of history) copyFileSync(join(local, src), join(destMigrations, stamped));
  for (const name of future) copyFileSync(join(local, name), join(destMigrations, name));
  console.log("Isolated staging workspace prepared:", history.length, "historical migrations and", future.length, "future timestamped migrations.");
  console.log("Remote history must be independently verified with supabase migration list --linked and a dry run before any write.");
}

if (process.argv[1]?.endsWith("prepare-staging-migration-workspace.mjs")) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging migration workspace preparation failed.");
    process.exitCode = 1;
  }
}
