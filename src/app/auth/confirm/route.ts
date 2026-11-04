import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { RECOVERY_COOKIE_NAME } from "@/lib/auth/password-recovery";

/** Password-recovery callback. Never include a token in a redirect URL.
 * Supports:
 *  1. Original Supabase {{ .ConfirmationURL }} -> ?code=... (PKCE)
 *  2. SSR-safe {{ .TokenHash }} template -> ?token_hash=...&type=recovery
 */
export async function GET(request: NextRequest) {
  const callback = new URL(request.url);
  const denied = () => {
    const response = NextResponse.redirect(new URL("/forgot-password?error=invalid_link", callback), 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  if (!isSupabaseConfigured() || callback.searchParams.has("error")) return denied();
  const tokenHash = callback.searchParams.get("token_hash");
  const type = callback.searchParams.get("type");
  const code = callback.searchParams.get("code");
  const flow = callback.searchParams.get("flow");

  // This route ONLY handles password recovery; signup continues to
  // use /auth/callback, so no other auth event can set the reset flag.
  if (flow !== "recovery") return denied();
  if ((!tokenHash && !code) || (tokenHash && type !== "recovery")) return denied();

  try {
    const supabase = await createSupabaseServerClient();
    const result = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (result.error) return denied();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return denied();

    const response = NextResponse.redirect(new URL("/reset-password", callback), 303);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(RECOVERY_COOKIE_NAME, "verified", {
      httpOnly: true,
      secure: callback.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return denied();
  }
}
