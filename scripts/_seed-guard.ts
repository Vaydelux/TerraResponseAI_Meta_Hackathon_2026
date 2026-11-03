// scripts/_seed-guard.ts
//
// Shared guard for demo/seeding scripts.
//
// Refuses to run scripts that seed demo admin credentials or demo data
// against an unverified Supabase project. Non-local seeding is allowed
// only when the URL exactly identifies an explicitly configured staging
// project that is distinct from production.
//
// Why: the prior version of seed-demo.ts shipped with default
// credentials (admin@terra.ai / admin123) and would happily run against
// any Supabase URL - including a fresh production project where the
// operator forgot to delete the demo data. This guard prevents that
// class of accidents.
//
// "Looks like production" heuristics:
//   * NOT localhost / 127.0.0.1 / .local
//   * NOT a Supabase preview/staging project ref (.supabase.co with a
//     project ref prefix, which is the default for any real project)
//
// The guard is conservative: a Supabase project on the .supabase.co
// domain is refused unless staging and production refs are explicit.
// Local dev (supabase start -> http://localhost:54321) is always
// allowed.

/**
 * Throw (with a clear message) if seeding is not allowed in the
 * current environment. Returns true when allowed.
 */
export function assertSeedEnvironmentAllowed(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").toLowerCase();
  if (!url) {
    // The caller will produce the "missing env" error; here we just
    // pass through - no URL to inspect.
    return true;
  }

  // Local Supabase (supabase start) endpoints - always allowed.
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const isLocal = localHosts.some((h) => url.includes("//" + h) || url.includes("://" + h + ":"));

  if (isLocal) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  const stagingRef = (process.env.STAGING_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase();
  const productionRef = (process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase();
  const expectedHost = stagingRef ? `${stagingRef}.supabase.co` : "";
  const knownProductionRef = "ywopsafppyykhwrejliz";

  if (!stagingRef || !productionRef || stagingRef === productionRef ||
      stagingRef === knownProductionRef || parsed.hostname !== expectedHost ||
      parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    console.error("");
    console.error("============================================================");
    console.error(" Refusing to seed: target is not an explicitly identified staging project.");
    console.error("============================================================");
    console.error(" Set STAGING_SUPABASE_PROJECT_REF and PRODUCTION_SUPABASE_PROJECT_REF");
    console.error(" in protected staging configuration, and ensure the URL matches staging.");
    console.error(" Production first-admin setup must use a confirmed normal signup plus");
    console.error(" scripts/bootstrap-admin.ts; it must not use this seed script.");
    console.error("");
    process.exit(1);
  }

  console.warn(`[seed-guard] verified isolated staging target ${stagingRef}; values not printed.`);
  return true;
}

/**
 * Resolve the admin password from env. Refuses to fall back to any
 * hardcoded default - the operator MUST set DEMO_SEED_ADMIN_PASSWORD
 * (and DEMO_SEED_REVIEWER_PASSWORD) themselves.
 *
 * @param name env var name
 * @returns the password (non-empty)
 * @throws if the env var is missing or empty
 */
export function requireSeedPassword(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 12) {
    console.error("");
    console.error("[FAIL] " + name + " is not set or is shorter than 12 characters.");
    console.error("  The demo seed no longer ships with default credentials.");
    console.error("  Set " + name + " in your .env to a strong, randomly-generated");
    console.error("  password (e.g. run: openssl rand -base64 24).");
    console.error("");
    console.error("  Example .env entries (DEV/DEMO only - NEVER commit):");
    console.error("    " + name + "=\"<the value you generated with openssl>\"");
    process.exit(1);
  }
  return v;
}
