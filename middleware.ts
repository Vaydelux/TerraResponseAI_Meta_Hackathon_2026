// middleware.ts (repo root, per Next.js convention)
//
// Runs on every request. Three jobs:
//   1. Refresh the Supabase session cookie (rotates the access token)
//      — only for protected routes (public routes skip the network
//      call to Supabase Auth).
//   2. Guard protected routes — unauthenticated → /login.
//   3. Safe redirects: protected unauthenticated pages → /login.
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
const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/callback", "/account-unavailable"];

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

  // Do not automatically redirect /login to /dashboard. A valid Auth
  // session does not prove the profile query or membership grants succeed.
  // Redirecting here while (app)/layout redirects profile failures back
  // to /login caused an infinite 307 loop. Signed-in users navigate to
  // /dashboard explicitly after successful verification.
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
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  // Match every path except static assets and API routes (handled above).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
