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
const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/callback", "/account-unavailable", "/demo/walkthrough"];

function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// Explicit public assets are always accessible, even when Supabase Auth is
// configured. Do not bypass every path with a file extension: private evidence
// remains protected by route handlers, Supabase Storage policies, and RLS.
const PUBLIC_ASSET_PREFIXES = ["/assets/", "/brand/", "/demo/", "/hero/"] as const;
const PUBLIC_ASSET_PATHS = new Set(["/logo.svg", "/icon.svg", "/favicon.ico", "/robots.txt"]);

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    PUBLIC_ASSET_PATHS.has(pathname) ||
    PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
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
  // Public asset paths are exempted by isStaticAsset; retain the existing matcher
  // to avoid accidentally exempting sensitive routes on extension alone.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
