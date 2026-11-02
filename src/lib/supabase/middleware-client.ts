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
      setAll(cookiesToSet, headersToSet) {
        // Refresh must reach BOTH downstream Server Components and browser.
        // The initial NextResponse.next snapshot precedes these cookie
        // mutations; rebuilding it is required to propagate request changes.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        // Supabase SSR includes private cache headers on token refresh.
        // Preserve them to prevent an auth response from being CDN-cached.
        if (headersToSet) {
          for (const [name, value] of Object.entries(headersToSet)) {
            response.headers.set(name, value);
          }
        }
      },
    },
  });

  // getUser() verifies the JWT against Supabase Auth and refreshes
  // expired tokens via the SSR cookie adapter when appropriate.
  // A second getSession() read is unnecessary and can fail after a
  // successful verification, turning /login into a 500/error boundary.
  // On a provider outage, fail closed (unauthenticated) rather than
  // throwing an uncaught middleware exception.
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { response, user: null };
    }
    return { response, user: { id: data.user.id, email: data.user.email } };
  } catch {
    console.error("[auth-middleware] Supabase Auth verification unavailable.");
    return { response, user: null };
  }
}
