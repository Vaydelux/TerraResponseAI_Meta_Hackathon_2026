/**
 * First-administrator bootstrap. Run only from a trusted, owner-controlled CLI
 * environment with SUPABASE_SERVICE_ROLE_KEY configured; NEVER expose this
 * operation as a Next.js Server Action or API endpoint.
 *
 * Usage: bun run scripts/bootstrap-admin.ts person@example.org
 *
 * This one-time operation refuses to proceed if an administrator already exists.
 * The database lookup and promotion are not atomic; execute only in a trusted,
 * isolated maintenance window and verify the resulting role.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
    console.error("Usage: bun run scripts/bootstrap-admin.ts <existing-account-email>");
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    console.error("Missing Supabase URL or service-role configuration.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: admins, error: readError } = await supabase
    .from("profiles").select("id").eq("role", "admin").limit(1);
  if (readError) throw new Error("Unable to verify administrator bootstrap precondition.");
  if (admins?.length) throw new Error("An administrator already exists; bootstrap refused.");

  const { data: promoted, error: writeError } = await supabase
    .from("profiles").update({ role: "admin" }).eq("email", email).select("id, role");
  if (writeError) throw new Error("Administrator bootstrap update failed.");
  if (promoted?.length !== 1 || promoted[0].role !== "admin") {
    throw new Error("Bootstrap could not verify exactly one promoted account.");
  }
  console.log("First administrator bootstrap completed. Verify role and audit records.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
});
