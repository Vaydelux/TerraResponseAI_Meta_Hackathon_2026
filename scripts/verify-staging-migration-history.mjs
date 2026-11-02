/**
 * Assert that every historical migration is already installed remotely.
 * This fails closed before staging 'db push' if the Supabase CLI's table
 * format changes or if any recorded historical version is missing.
 *
 * Usage: node scripts/verify-staging-migration-history.mjs <cli-list-output>
 */
import { readFileSync } from "node:fs";
import { history } from "./prepare-staging-migration-workspace.mjs";

export function verifyHistory(output) {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const rows = plain.split(/\r?\n/).map(line => line.split(/[│|]/).map(cell => cell.trim()));
  const missing = [];
  for (const [, filename] of history) {
    const version = filename.slice(0, 14);
    const existsOnBothSides = rows.some(cols =>
      cols.length >= 2 && cols[0] === version && cols[1] === version
    );
    if (!existsOnBothSides) missing.push(version);
  }
  if (missing.length) throw new Error(
    "Historical staging versions absent from BOTH local and remote migration list: " +
    missing.join(", ") + ". Refusing any database push."
  );
  return history.length;
}

if (process.argv[1]?.endsWith("verify-staging-migration-history.mjs")) {
  try {
    if (process.env.SUPABASE_PROJECT_REF !== "ytfaetqvtbsbmcsdlkvk" ||
        process.env.PRODUCTION_PROJECT_REF !== "ywopsafppyykhwrejliz") {
      throw new Error("Staging history verification refused for this target.");
    }
    const path = process.argv[2];
    if (!path) throw new Error("Migration-list output path required.");
    console.log("Verified", verifyHistory(readFileSync(path, "utf8")), "historical staging migrations applied remotely.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging history verification failed.");
    process.exitCode = 1;
  }
}
