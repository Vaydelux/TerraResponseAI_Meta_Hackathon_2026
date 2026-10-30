// scripts/_seed-guard.ts
//
// Shared guard for demo/seeding scripts.
//
// Refuses to run scripts that seed demo admin credentials or demo data
// against a Supabase project whose URL looks like a production endpoint,
// unless the operator has explicitly opted in via
// ALLOW_DEMO_SEED_ON_PRODUCTION=1.
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
// domain is assumed production unless ALLOW_DEMO_SEED_ON_PRODUCTION=1.
// Local dev (supabase start -> http://localhost:54321) is always
// allowed.

/**
 * Throw (with a clear message) if seeding is not allowed in the
 * current environment. Returns true when allowed.
 */
export function assertSeedEnvironmentAllowed(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").toLowerCase();
  const override = process.env.ALLOW_DEMO_SEED_ON_PRODUCTION === "1";

  if (!url) {
    // The caller will produce the "missing env" error; here we just
    // pass through - no URL to inspect.
    return true;
  }

  // Local Supabase (supabase start) endpoints - always allowed.
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const isLocal = localHosts.some((h) => url.includes("//" + h) || url.includes("://" + h + ":"));

  if (isLocal) return true;

  // Anything on .supabase.co (or any other real hostname) is
  // treated as production unless the operator opted in.
  if (!override) {
    console.error("");
    console.error("============================================================");
    console.error(" Refusing to seed against a non-local Supabase project.");
    console.error("============================================================");
    console.error("");
    console.error(" The configured NEXT_PUBLIC_SUPABASE_URL is not a localhost");
    console.error(" endpoint. Seeding demo data + demo admin credentials into a");
    console.error(" production / shared Supabase project is dangerous - it can");
    console.error(" leave the project in a state where the demo admin");
    console.error(" (admin@terra.ai / <your-password>) can sign in and act on");
    console.error(" demo reports that look like real disaster reports.");
    console.error("");
    console.error(" If this is genuinely a dev/demo project (NOT the production");
    console.error(" Supabase), re-run with:");
    console.error("");
    console.error("     ALLOW_DEMO_SEED_ON_PRODUCTION=1 bun run scripts/seed-demo.ts");
    console.error("");
    console.error(" For production first-admin setup, use the secure path:");
    console.error("");
    console.error("     1. Sign up at /login (creates a profile with role=reporter)");
    console.error("     2. Run: bun run scripts/bootstrap-admin.ts <your-email>");
    console.error("");
    process.exit(1);
  }

  // Override set - warn loudly and proceed.
  console.warn("");
  console.warn("============================================================");
  console.warn(" WARNING: ALLOW_DEMO_SEED_ON_PRODUCTION=1 is set.");
  console.warn("============================================================");
  console.warn("");
  console.warn(" Demo data + demo admin credentials will be seeded against a");
  console.warn(" non-local Supabase project. Make sure this is a dev/demo");
  console.warn(" project, NOT production. The demo admin's password is read");
  console.warn(" from DEMO_SEED_ADMIN_PASSWORD (which MUST be set to a strong");
  console.warn(" value - the script refuses to use a default password).");
  console.warn("");
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
