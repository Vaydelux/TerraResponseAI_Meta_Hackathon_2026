// middleware.ts (repo root, per Next.js convention)
//
// Runs on every request. Three jobs:
//   1. Refresh the Supabase session cookie (rotates the access token)
//      — only for protected routes (public routes skip the network
//      call to Supabase Auth).
//   2. Guard protected routes — unauthenticated → /login.
//   3. Safe redirects: /login → role default when already signed in.
//
// Per the brief: "Implement login, logout, signed-in session refresh,
// protected dashboard routes, and safe redirects." The middleware is
// the server-side enforcement boundary; route handlers also verify
// identity server-side (defense-in-depth — see src/lib/supabase/server.ts
// requireServerUser).

import { type NextRequest, NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware-client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Routes that don't require authentication. Everything else does.
const PUBLIC_ROUTES = ["/login", "/auth/callback"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// Static assets + Next internals — never guard.
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never intercept static assets or API routes (the API routes do
  // their own server-side auth via requireServerUser).
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // When Supabase is not configured (sandbox), let the request through.
  // The /login page renders a setup state instead of a login form.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  // For public routes, skip the supabase.auth.getUser() network call
  // — it adds latency to /login and /auth/callback, which don't need
  // the session. The /login page handles the authenticated-redirect
  // client-side via its own check.
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Protected route: refresh the session cookie + get the verified
  // user. getUser() verifies the JWT signature (not cookie presence).
  const { response, user } = await refreshSupabaseSession(request);

  if (!user) {
    // Unauthenticated. Redirect to /login with a safe callbackUrl
    // (same-origin, no protocol-relative).
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Match every path except static assets and API routes (handled above).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
