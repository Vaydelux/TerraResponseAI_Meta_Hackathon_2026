// Server-side entry point: only imported by Next.js server routes/components.
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";

export const COMMUNITY_INTAKE_SLUG = "community-intake";

/**
 * Rollout gate: production keeps existing event-scoped behavior until
 * staging proves role isolation and intake event/membership persistence.
 */
export function isCommunityIntakeEnabled() {
  return process.env.REPORT_FIRST_INTAKE_ENABLED === "true";
}

export async function ensureCommunityIntakeMembership(userId: string): Promise<string | null> {
  if (!isCommunityIntakeEnabled()) return null;
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
  // Upsert with ignoreDuplicates prevents demoting existing reviewer
  // or coordinator memberships. DB unique(event_id,user_id) serializes
  // two concurrent first reports from the same person.
  const { error } = await db.from("event_members")
    .upsert({ event_id: event.id, user_id: userId, role: "contributor" }, {
      onConflict: "event_id,user_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error("Unable to enroll in community intake.");
  return event.id as string;
}
