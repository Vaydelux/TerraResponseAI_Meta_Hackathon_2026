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
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: "reporter" | "reviewer" | "admin";
}

export interface UserEventMembership {
  event_id: string;
  event_name: string;
  event_slug: string;
  event_status: string;
  role: "contributor" | "reviewer" | "coordinator";
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
export async function getAuthContext(user?: { id: string } | null): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  // Reuse the caller's user if provided; otherwise verify server-side.
  const resolvedUser = user ?? (await supabase.auth.getUser()).data.user;
  if (!resolvedUser) return null;

  // Profile (global role). RLS: self OR admin (profiles_select_self_or_admin).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", resolvedUser.id)
    .single();
  if (!profile) return null;

  // Event memberships. RLS: event members see their own memberships.
  // The Supabase client without generated types returns `any`; we cast
  // to the expected shape. The `events:event_id(...)` join returns an
  // array (one-to-many), so we take the first element.
  const { data: memberships } = await supabase
    .from("event_members")
    .select("event_id, role, events:event_id(id, name, slug, status)")
    .eq("user_id", resolvedUser.id);

  const events: UserEventMembership[] = ((memberships ?? []) as unknown as Array<{
    event_id: string;
    role: "contributor" | "reviewer" | "coordinator";
    events: Array<{ id: string; name: string; slug: string; status: string }>;
  }>)
    .filter((m) => m.events && m.events.length > 0)
    .map((m) => ({
      event_id: m.event_id,
      event_name: m.events[0].name,
      event_slug: m.events[0].slug,
      event_status: m.events[0].status,
      role: m.role,
    }));

  return {
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
    },
    events,
    // activeEventId is resolved client-side via a cookie/localStorage;
    // the server doesn't pick a default — the events picker does.
    activeEventId: null,
  };
}
