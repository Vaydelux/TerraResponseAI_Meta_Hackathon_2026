// src/lib/supabase/server.ts
//
// Server-side Supabase client factory using @supabase/ssr's cookies()
// pattern. Use this in Server Components, Route Handlers, and Server
// Actions to read the user's session from the request cookies.
//
// Official @supabase/ssr pattern (v0.12+):
//   import { createServerClient } from "@supabase/ssr";
//   import { cookies } from "next/headers";
//   const supabase = createServerClient(url, anonKey, {
//     cookies: {
//       getAll() { return cookieStore.getAll() },
//       setAll(cookiesToSet) { cookieStore.set(...) }
//     }
//   });
//
// The `setAll` is required so the session-refresh flow can write
// rotated tokens back to the response cookies. In Server Components
// (read-only), `next/headers`' cookies() is read-only, so `setAll`
// must tolerate the error — the middleware handles the actual refresh.
//
// This module is server-only (next/headers). Never import from a
// client component.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "./env";

/**
 * Create a Supabase client bound to the incoming request's cookies.
 * Use in Server Components, Route Handlers, and Server Actions.
 *
 * Returns a no-op client when Supabase is not configured (sandbox);
 * callers should check `isSupabaseConfigured()` first and render a
 * setup state instead of calling this.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This happens when the session refreshes in a Server
          // Component — the middleware handles the actual cookie
          // write. Safe to ignore.
        }
      },
    },
  });
}

/**
 * Server-side identity verification. Returns the authenticated user
 * or null. This is the boundary every mutating route handler must
 * call — never trust cookie presence alone; always call
 * `getUser()` which verifies the JWT signature against the Supabase
 * project's keys.
 *
 * Per the brief: "Use server-side identity verification on mutations,
 * not cookie presence alone."
 */
export async function getServerUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require an authenticated user. Throws a typed error if absent.
 * Route handlers catch this and return 401.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export { isSupabaseConfigured };
