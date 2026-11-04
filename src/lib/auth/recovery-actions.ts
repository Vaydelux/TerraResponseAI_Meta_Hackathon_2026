"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  RECOVERY_COOKIE_NAME,
  recoveryCallbackUrl,
  validateNewPassword,
  validRecoveryEmail,
} from "@/lib/auth/password-recovery";

export type RequestResetState = { status: "idle" | "sent" | "error"; error?: string };
export type UpdatePasswordState = { error?: string } | null;

export async function requestPasswordResetAction(
  _previous: RequestResetState,
  data: FormData,
): Promise<RequestResetState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", error: "Password recovery is not configured." };
  }

  const email = validRecoveryEmail(String(data.get("email") ?? ""));
  if (!email) return { status: "error", error: "Enter a valid email address." };

  try {
    const callback = recoveryCallbackUrl({
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      local: process.env.NODE_ENV === "development" && !process.env.VERCEL_URL,
    });
    // @supabase/ssr persists the PKCE verifier in a cookie for the
    // ordinary ConfirmationURL flow. The optional token-hash template
    // also supports opening recovery links in another browser/device.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callback,
    });
    if (error) {
      const throttled = /rate|limit|too many|wait/i.test(error.message);
      return {
        status: "error",
        error: throttled
          ? "Too many reset requests. Please try again in a few minutes."
          : "We could not request a reset email right now. Please try again later.",
      };
    }
  } catch {
    return { status: "error", error: "Password reset is temporarily unavailable." };
  }

  // The same response for known and unknown accounts prevents enumeration.
  return { status: "sent" };
}

export async function updateRecoveredPasswordAction(
  _previous: UpdatePasswordState,
  data: FormData,
): Promise<UpdatePasswordState> {
  if (!isSupabaseConfigured()) return { error: "Password recovery is unavailable." };

  const cookieJar = await cookies();
  if (cookieJar.get(RECOVERY_COOKIE_NAME)?.value !== "verified") {
    return { error: "The reset link is missing or expired. Request a new password reset email." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userResult, error: authError } = await supabase.auth.getUser();
  if (authError || !userResult.user) {
    return { error: "Your reset session expired. Please request a new link." };
  }

  const password = String(data.get("password") ?? "");
  const confirmation = String(data.get("confirmation") ?? "");
  const issue = validateNewPassword(password, confirmation, userResult.user.email);
  if (issue) return { error: issue };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Unable to save your new password. Try a different password or request a fresh link." };
  }

  // End the temporary recovery session so the user can sign in explicitly.
  await supabase.auth.signOut();
  cookieJar.delete(RECOVERY_COOKIE_NAME);
  redirect("/login?password_reset=success");
}
