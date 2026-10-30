/**
 * Bootstrap the first TerraResponse AI administrator.
 *
 * Prerequisite: Supabase is configured (NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY env vars
 * set) and the user with the given email has already signed up via
 * Supabase Auth (the handle_new_user trigger created their profile
 * with role='reporter').
 *
 * Run:
 *   bun run scripts/bootstrap-admin.ts you@example.com
 *
 * The action refuses if any admin already exists (one-time gate).
 * See README §First admin.
 */
import { bootstrapFirstAdminAction } from "../src/lib/auth/actions";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: bun run scripts/bootstrap-admin.ts <email>");
    process.exit(1);
  }
  console.log(`[bootstrap] promoting ${email} to admin…`);
  const result = await bootstrapFirstAdminAction(email);
  if (result.ok) {
    console.log("[bootstrap] success — the user is now an admin.");
  } else {
    console.error(`[bootstrap] failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[bootstrap] unexpected error:", e);
  process.exit(1);
});
