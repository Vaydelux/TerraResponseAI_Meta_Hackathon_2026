// src/app/auth/callback/route.ts
//
// Supabase email-confirmation + OAuth callback. Supabase redirects
// here with a `code` query param after email verification or an OAuth
// provider login. We exchange the code for a session and redirect
// to the dashboard.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeAuthRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Redirect to login with an error message.
      return NextResponse.redirect(
        new URL("/login?error=auth_callback_failed", request.url),
      );
    }
  }

  // Require a path-relative target and confirm the parsed URL remains on
  // this origin. A naive startsWith("/") check allows "/\\evil.example"
  // to be interpreted as a protocol-relative redirect by URL parsers.
  return NextResponse.redirect(safeAuthRedirect(next, requestUrl));
}
