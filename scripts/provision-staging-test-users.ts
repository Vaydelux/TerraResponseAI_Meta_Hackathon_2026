/**
 * Manually run ONLY by the protected "staging" GitHub Actions environment.
 * Usernames and passwords arrive through environment secrets, not source code.
 * The Supabase Auth Admin API creates the identities correctly without
 * sending confirmation mail; direct SQL inserts into auth.users are unsafe.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const ref = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
  const production = process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "";
  const url = process.env.STAGING_SUPABASE_URL ?? "";
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const confirmed = process.env.CONFIRM_ACTION ?? "";
  const inputRef = process.env.CONFIRM_PROJECT_REF ?? "";
  if (confirmed !== "CREATE-STAGING-TEST-USERS" ||
      !/^[a-z0-9]{12,32}$/.test(ref) ||
      ref === production || ref === "ywopsafppyykhwrejliz" ||
      inputRef !== ref || url !== `https://${ref}.supabase.co` || !key) {
    throw new Error("Staging-only guard failed. No identities created.");
  }

  const entries = [
    { role: "reporter", email: process.env.TEST_REPORTER_EMAIL, password: process.env.TEST_REPORTER_PASSWORD },
    { role: "reviewer", email: process.env.TEST_REVIEWER_EMAIL, password: process.env.TEST_REVIEWER_PASSWORD },
    { role: "admin", email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD },
  ] as const;

  if (entries.some(x => !x.email || !x.password || x.password.length < 16) ||
      new Set(entries.map(x => x.email?.trim().toLowerCase())).size !== 3 ||
      entries.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email!))) {
    throw new Error("Configure 3 unique valid emails and separate strong passwords of at least 16 chars in protected staging secrets.");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const createdIds: string[] = [];
  try {
    for (const entry of entries) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: entry.email!.trim().toLowerCase(),
        password: entry.password!,
        email_confirm: true,
        user_metadata: { name: `qa_${entry.role}`, username: `qa_${entry.role}` },
      });
      if (error || !data.user) {
        throw new Error(`Auth Admin failed creating ${entry.role} test user, code: ${error?.code ?? "unknown"}.`);
      }
      createdIds.push(data.user.id);
      const { data: changed, error: profileError } = await supabase
        .from("profiles")
        .update({ role: entry.role, name: `qa_${entry.role}` })
        .eq("id", data.user.id)
        .select("id, role");
      if (profileError || changed?.length !== 1 || changed[0]?.role !== entry.role) {
        throw new Error(`Profile role verification failed for ${entry.role}.`);
      }
      console.log(`Created and verified staging ${entry.role} account (identifier withheld).`);
    }
  } catch (failure) {
    // Compensate for partial provision. Never delete any existing account:
    // only the IDs created in THIS invocation are eligible.
    let cleanupFailed = false;
    for (const id of createdIds.reverse()) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new Error("Staging provisioning failed and compensation was incomplete. Audit and remove the partial staging identities.");
    }
    throw failure;
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Staging test-user provisioning failed.");
  process.exitCode = 1;
});
