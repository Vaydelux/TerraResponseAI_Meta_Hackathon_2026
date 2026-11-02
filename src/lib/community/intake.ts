// Server-side entry point: only imported by Next.js server routes/components.
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";

export const COMMUNITY_INTAKE_SLUG = "community-intake";

/**
 * Report-first intake is the default in every environment. The explicit
 * false value is an emergency rollback switch, not a launch prerequisite.
 * Never create arbitrary event memberships from user-supplied event IDs.
 */
export function isCommunityIntakeEnabled() {
  return process.env.REPORT_FIRST_INTAKE_ENABLED !== "false";
}

export async function ensureCommunityIntakeMembership(userId: string): Promise<string> {
  if (!isCommunityIntakeEnabled()) throw new Error("Community reporting is paused.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Invalid authenticated user.");
  }
  const key = serviceRoleKey();
  const url = supabaseUrl();
  if (!key || !url) throw new Error("Community intake is not configured.");

  // This is a FIXED server-selected system event, not an arbitrary
  // client eventId. Users cannot self-enroll in other private events.
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: event, error: eventError } = await db
    .from("events").select("id,status").eq("slug", COMMUNITY_INTAKE_SLUG).maybeSingle();
  if (eventError || !event || event.status !== "active") {
    throw new Error("Community intake is unavailable.");
  }
  // Global Reviewer and Admin identities must receive an appropriate
  // community event role; otherwise newly joined reviewers would be
  // blocked from moderating reports despite their authorized app role.
  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", userId).single();
  if (profileError || !profile) throw new Error("Community reporter profile unavailable.");
  const memberRole = profile.role === "admin" ? "coordinator"
    : profile.role === "reviewer" ? "reviewer" : "contributor";

  // Upsert with ignoreDuplicates prevents demoting existing reviewer
  // or coordinator memberships. DB unique(event_id,user_id) serializes
  // two concurrent first reports from the same person.
  const { error } = await db.from("event_members")
    .upsert({ event_id: event.id, user_id: userId, role: memberRole }, {
      onConflict: "event_id,user_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error("Unable to enroll in community intake.");
  return event.id as string;
}
