// src/lib/supabase/middleware-client.ts
//
// Supabase client for the Next.js middleware. The middleware runs
// on every request and must refresh the session cookie (Supabase
// rotates the access token on each request; the middleware writes
// the rotated token back so the next request has a fresh token).
//
// Official @supabase/ssr pattern (v0.12+):
//   import { createServerClient } from "@supabase/ssr";
//   const supabase = createServerClient(url, anonKey, {
//     cookies: { getAll, setAll }  // operate on the NextResponse cookies
//   });
//   await supabase.auth.getUser();
//   const { data: { session } } = await supabase.auth.getSession();
//   if (session) { /* refresh */ }

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "./env";

/**
 * Refresh the Supabase session cookie on every request. Called from
 * middleware.ts. Returns the NextResponse with updated cookies.
 *
 * When Supabase is not configured (sandbox), this is a no-op that
 * just passes the request through.
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      response: NextResponse.next({ request }),
      user: null,
    };
  }

  // Create a response we can write cookies into.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() verifies the JWT signature; getSession() reads the
  // cached session. Calling getUser() is the official recommendation
  // for server-side identity verification (it hits Supabase Auth,
  // not the local cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Refresh the session cookie (rotates the access token).
  await supabase.auth.getSession();

  return { response, user };
}
