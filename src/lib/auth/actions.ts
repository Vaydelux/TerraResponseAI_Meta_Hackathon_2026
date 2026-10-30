// src/lib/auth/actions.ts
//
// Server actions for Supabase email auth: signIn, signOut, and the
// first-admin onboarding bootstrap. Server-only — uses the
// @supabase/ssr cookies() pattern.
//
// Per the brief:
//   - "Implement login, logout, signed-in session refresh, protected
//     dashboard routes, and safe redirects."
//   - "Use server-side identity verification on mutations, not cookie
//     presence alone." — signIn calls supabase.auth.signInWithPassword
//     (server-side), signOut calls supabase.auth.signOut (server-side).
//   - "Create a safe onboarding path for the first administrator
//     documented in setup, rather than permitting users to self-assign
//     reviewer/admin privileges." — bootstrapFirstAdmin() is the ONLY
//     way to promote a user to admin, and it requires the service-role
//     key + an empty profiles table (no existing admins).
//
// Phase 18: Added login rate limiting (brute-force protection) using
// the audit_events table. Tracks AUTH_FAILED entries per email in a
// rolling 1-hour window; blocks after 10 failures (configurable via
// LOGIN_RATE_LIMIT_PER_HOUR env var, default 10).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";

export type SignInState = { error?: string } | null;

/** Read the login rate limit from env (default 10 attempts/hour). */
function getLoginRateLimit(): number {
  const raw = process.env.LOGIN_RATE_LIMIT_PER_HOUR;
  if (raw === undefined || raw === "") return 10;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/**
 * Login is pre-authentication: authenticated-only RLS and RPC grants
 * cannot be used to record or count failures. This client is strictly
 * server-side, scoped to the two login-audit operations below.
 * It never accepts caller-provided actor IDs or audit action names.
 */
function createTrustedLoginAuditClient() {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Count failures through a server-only privileged client. Ordinary users
 * cannot read audit_events due to its admin-only RLS policy.
 * Fail closed if we cannot check: otherwise a DB outage disables the
 * application-level brute-force protection.
 */
async function checkLoginRate(email: string): Promise<{
  blocked: boolean;
  used: number;
  limit: number;
  unavailable?: boolean;
}> {
  const limit = getLoginRateLimit();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await createTrustedLoginAuditClient()
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .in("action", ["auth_failed", "AUTH_FAILED"])
      .eq("metadata->>email", email)
      .gte("created_at", oneHourAgo);

    if (error || count === null) {
      console.error("[auth] Login rate-limit audit query unavailable.");
      return { blocked: true, used: 0, limit, unavailable: true };
    }
    return { blocked: count >= limit, used: count, limit };
  } catch {
    console.error("[auth] Login rate-limit audit query failed.");
    return { blocked: true, used: 0, limit, unavailable: true };
  }
}

/**
 * Record pre-authentication failures using tightly scoped, server-controlled
 * data. Never expose the service key to browsers or allow user-supplied audit
 * actors/actions. This is the deliberate system-event exception to the
 * authenticated user's write_audit_event() pathway.
 */
async function recordAuthFailure(email: string): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      // Forwarded headers are not proof of client identity; recorded for
      // diagnostics only, never treated as verified security evidence.
      const xff = h.get("x-forwarded-for");
      ip = xff ? xff.split(",")[0].trim() : (h.get("x-real-ip") ?? null);
      userAgent = h.get("user-agent")?.slice(0, 512) ?? null;
    } catch { /* not in request context */ }

    const { error } = await createTrustedLoginAuditClient()
      .from("audit_events")
      .insert({
        actor_id: null,
        action: "auth_failed",
        target_id: null,
        target_type: null,
        metadata: { email },
        ip,
        user_agent: userAgent,
      });
    if (error) {
      console.error("[auth] Failed to record pre-auth login attempt.");
    }
  } catch {
    console.error("[auth] Pre-auth login audit write unavailable.");
  }
}

/**
 * Sign in with email + password. Server-side verification via
 * supabase.auth.signInWithPassword — the password is never seen by
 * the client after the form POST. On success, revalidate + redirect
 * to the dashboard (or a safe callbackUrl).
 *
 * Phase 18: Added login rate limiting (brute-force protection).
 * Checks the audit_events table for recent AUTH_FAILED entries
 * for this email. Blocks after 10 failures/hour (configurable).
 */
export async function signInAction(formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See the setup instructions on this page." };
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createSupabaseServerClient();

  // 1. Check login rate limit (brute-force protection).
  const rate = await checkLoginRate(email);
  if (rate.unavailable) {
    return { error: "Login is temporarily unavailable. Please try again later." };
  }
  if (rate.blocked) {
    return { error: `Too many failed login attempts (${rate.used}/${rate.limit} in the last hour). Please try again later.` };
  }

  // 2. Attempt sign-in.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 3. Record the failed attempt for rate-limiting.
    await recordAuthFailure(email);
    return { error: "Invalid email or password. Please try again." };
  }

  // Safe redirect: same-origin, no protocol-relative.
  const safe = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/dashboard";
  revalidatePath("/", "layout");
  redirect(safe);
}

/**
 * Sign out. Server-side supabase.auth.signOut + redirect to /login.
 */
export async function signOutAction(): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Bootstrap the first administrator. This is the safe onboarding path:
 *   1. No existing admin in the profiles table (one-time gate).
 *   2. The caller supplies an email that already exists in auth.users
 *      (i.e., the user signed up but their profile is the default
 *      'reporter' role).
 *   3. The action runs with the service-role key (server-side only;
 *      never exposed to the browser) to UPDATE the profile to 'admin'.
 *
 * Per the brief: "rather than permitting users to self-assign
 * reviewer/admin privileges." After the first admin, all role changes
 * go through the admin UI (Phase 4) which is itself gated by the
 * is_admin() RLS helper.
 *
 * This action is intentionally simple: it's run from a setup page
 * (documented in README §First admin) by someone with shell access
 * to the server, NOT from the public /login page. The README
 * documents the procedure.
 */
export async function bootstrapFirstAdminAction(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email is required." };
  }

  // Use the service-role client (bypasses RLS). Server-side only.
  const serviceClient = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Gate: refuse if any admin already exists (one-time bootstrap).
  const { data: existingAdmins, error: countErr } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (countErr) return { ok: false, error: countErr.message };
  if (existingAdmins && existingAdmins.length > 0) {
    return { ok: false, error: "An admin already exists. Use the admin UI to promote further users." };
  }

  // Promote the profile matching the email. The user must already be
  // signed up (auth.users row exists); the handle_new_user trigger
  // created their profile with role='reporter'. Use .select() so we
  // can verify a row was actually updated (PostgREST returns no error
  // for 0 rows updated, so without .select() we'd silently succeed
  // even when no profile matched the email).
  const { data: updated, error: updateErr } = await serviceClient
    .from("profiles")
    .update({ role: "admin" })
    .eq("email", email.toLowerCase())
    .select("id");

  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: `No profile found for ${email}. The user must sign up first so the handle_new_user trigger creates their profile.`,
    };
  }
  return { ok: true };
}
