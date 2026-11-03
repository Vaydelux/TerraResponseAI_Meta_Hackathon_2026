// src/lib/auth/profile.ts
//
// Server-side profile + role + events lookup for the signed-in user.
// Uses the @supabase/ssr server client (bound to the request cookies)
// so RLS applies: the user can only see their own profile + events
// they're a member of.
//
// This is the "enforce membership again inside every server route"
// boundary — callers (route handlers, server components) pass the
// user id here and get back a typed profile + role + events list.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizeEventMemberships, type UserEventMembership } from "@/lib/auth/event-memberships";
export type { UserEventMembership } from "@/lib/auth/event-memberships";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: "reporter" | "reviewer" | "admin";
}

export interface AuthContext {
  user: UserProfile;
  events: UserEventMembership[];
  activeEventId: string | null;
}

/**
 * Fetch the signed-in user's profile + event memberships. Returns
 * null if the user is not authenticated or Supabase is not configured.
 *
 * RLS enforces: the user only sees events they're a member of (the
 * event_members SELECT policy filters by is_event_member(event_id)).
 *
 * Pass `user` to skip a duplicate supabase.auth.getUser() call when
 * the caller already verified the user (e.g., the (app) layout calls
 * getServerUser then getAuthContext — passing the user avoids a
 * second network round-trip to Supabase Auth).
 */
/**
 * Profile and workspace reads are independent. Run them concurrently and
 * memoize the result only for this Server Component render request.
 * This cache is NEVER shared between users or different HTTP requests.
 */
async function loadContextByUserId(userId: string): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("id, email, name, role").eq("id", userId).single(),
    supabase.from("event_members")
      .select("event_id, role, events:event_id(id, name, slug, status)")
      .eq("user_id", userId),
  ]);
  const profile = profileResult.data;
  if (!profile) return null;

  if (membershipResult.error) {
    console.error("[auth] Event membership lookup failed.", {
      code: membershipResult.error.code ?? "unknown",
    });
    throw new Error("Unable to load event permissions.");
  }
  return {
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
    },
    events: normalizeEventMemberships(membershipResult.data),
    activeEventId: null,
  };
}
const cachedContextByUserId = cache(loadContextByUserId);

/** Re-query after the first, server-authorized shared-intake enrollment. */
export async function reloadAuthContextForUserId(userId: string): Promise<AuthContext | null> {
  return loadContextByUserId(userId);
}

export async function getAuthContext(user?: { id: string } | null): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) return null;
  const resolvedUser = user ?? (await (await createSupabaseServerClient()).auth.getUser()).data.user;
  if (!resolvedUser) return null;
  return cachedContextByUserId(resolvedUser.id);
}
