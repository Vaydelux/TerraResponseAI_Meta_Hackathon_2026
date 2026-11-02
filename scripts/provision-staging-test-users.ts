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
  // Explicit allowlist: NEVER provision sample identities in production or
  // another project even if environment variables are accidentally swapped.
  if (confirmed !== "CREATE-STAGING-TEST-USERS" ||
      ref !== "ytfaetqvtbsbmcsdlkvk" ||
      production !== "ywopsafppyykhwrejliz" ||
      inputRef !== ref || url !== `https://${ref}.supabase.co` || !key) {
    throw new Error("Staging-only guard failed. No identities created.");
  }

  const entries = [
    { role: "reporter", email: process.env.TEST_REPORTER_EMAIL || "qa.reporter@example.com", password: process.env.TEST_REPORTER_PASSWORD },
    { role: "reviewer", email: process.env.TEST_REVIEWER_EMAIL || "qa.reviewer@example.com", password: process.env.TEST_REVIEWER_PASSWORD },
    { role: "admin", email: process.env.TEST_ADMIN_EMAIL || "qa.admin@example.com", password: process.env.TEST_ADMIN_PASSWORD },
  ] as const;

  if (entries.some(x => !x.email || !x.password || x.password.length < 16) ||
      new Set(entries.map(x => x.password)).size !== 3 ||
      new Set(entries.map(x => x.email?.trim().toLowerCase())).size !== 3 ||
      entries.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email!))) {
    throw new Error("Provide 3 distinct strong passwords (16+ characters) and valid unique emails in protected staging secrets.");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Fail before creating any identity if this QA workspace already exists.
  // Never alter existing real event membership or overwrite an old run.
  const { data: existingEvent, error: lookupError } = await supabase
    .from("events")
    .select("id")
    .eq("slug", "hackathon-qa-roles")
    .maybeSingle();
  if (lookupError || existingEvent) {
    throw new Error("The staging QA event already exists or preflight failed. Inspect it instead of re-provisioning.");
  }
  const createdIds: string[] = [];
  let createdEventId: string | null = null;
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

    // A global role alone does not grant event access. Each sample account
    // must share one private test event to exercise upload, review and
    // coordinator permissions. This slug is intentionally staging-only.
    const adminUserId = createdIds[2];
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        slug: "hackathon-qa-roles",
        name: "QA Demo — Three Roles",
        description: "Isolated staging test event. Synthetic/authorized evidence only.",
        status: "active",
        location_label: "Test workspace — not a real incident",
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (eventError || !event?.id) {
      throw new Error("Creating the shared staging test event failed.");
    }
    createdEventId = event.id;

    const expectedMemberships = [
      { event_id: createdEventId, user_id: createdIds[0], role: "contributor" },
      { event_id: createdEventId, user_id: createdIds[1], role: "reviewer" },
      { event_id: createdEventId, user_id: createdIds[2], role: "coordinator" },
    ];
    const { data: memberships, error: membersError } = await supabase
      .from("event_members")
      .insert(expectedMemberships)
      .select("event_id, user_id, role");
    if (membersError || memberships?.length !== expectedMemberships.length ||
        !expectedMemberships.every(row => memberships.some(member =>
          member.event_id === row.event_id && member.user_id === row.user_id && member.role === row.role
        ))) {
      throw new Error("Staging role-to-event membership verification failed.");
    }
    console.log("Created the shared staging QA event with contributor, reviewer and coordinator memberships.");
  } catch (failure) {
    // Compensate for partial provision. Never delete any existing account:
    // only the IDs created in THIS invocation are eligible.
    let cleanupFailed = false;
    // Delete the newly-created event FIRST: events.created_by is a
    // RESTRICT foreign key, and memberships cascade from events.
    // Never delete or overwrite an existing event or identity.
    if (createdEventId) {
      const { error: deleteEventError } = await supabase.from("events").delete().eq("id", createdEventId);
      if (deleteEventError) cleanupFailed = true;
    }
    for (const id of createdIds.reverse()) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new Error("Staging QA provisioning failed and cleanup was incomplete. Audit newly created event and identities in the staging project.");
    }
    throw failure;
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Staging test-user provisioning failed.");
  process.exitCode = 1;
});
