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
 * Check if the login rate limit has been exceeded for this email.
 * Counts auth_failed audit events in the last hour. Fail-open on
 * error (a DB hiccup shouldn't block a legitimate login).
 *
 * The action value is lowercase ('auth_failed') — the
 * trg_normalize_audit_action trigger (0006_security_fixes.sql §17)
 * lowercases the action on INSERT, so all NEW rows are lowercase.
 * Existing rows may have 'AUTH_FAILED' (uppercase, the legacy form
 * emitted by the prior app code). To count both, we use `.in(...)`
 * instead of `.eq(...)`. Once all legacy rows age out (after 1 hour,
 * since the rate-limit window is 1h), this can be simplified to
 * `.eq('action', 'auth_failed')`.
 */
async function checkLoginRate(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, email: string): Promise<{ blocked: boolean; used: number; limit: number }> {
  const limit = getLoginRateLimit();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .in("action", ["auth_failed", "AUTH_FAILED"])
      .eq("metadata->>email", email)
      .gte("created_at", oneHourAgo);

    if (error) {
      // Fail-open: don't block on a DB error.
      console.warn(`[auth] login rate check failed (allowing): ${error.message}`);
      return { blocked: false, used: 0, limit };
    }
    const used = count ?? 0;
    return { blocked: used >= limit, used, limit };
  } catch {
    return { blocked: false, used: 0, limit };
  }
}

/**
 * Record a failed login attempt in the audit_events table.
 * Fail-open: a failed insert doesn't block the error response.
 */
async function recordAuthFailure(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, email: string): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      const xff = h.get("x-forwarded-for");
      // Leftmost IP only (not the chain) — the SSR can be behind a CDN
      // or proxy; the originating client is the leftmost entry.
      ip = xff ? xff.split(",")[0].trim() : (h.get("x-real-ip") ?? null);
      userAgent = h.get("user-agent") ?? null;
    } catch { /* not in request context */ }

    // Use the SSR client (bound to the request cookies) to call the
    // write_audit_event SECURITY DEFINER function — the canonical path.
    // The function forces actor_id = auth.uid() (which is NULL during a
    // failed login, before a session is established — the schema
    // allows this). The function's CHECK constraint accepts both
    // 'auth_failed' (lowercase — canonical) and 'AUTH_FAILED' (the
    // legacy form, kept for back-compat with existing rows).
    //
    // The previous version of this code used the service-role client
    // to INSERT directly into audit_events — bypassing the SECURITY
    // DEFINER function. That was a security issue (the service role
    // can set actor_id to an arbitrary value). The new version uses
    // the SSR client + the RPC so the function's actor_id = auth.uid()
    // guarantee holds.
    //
    // The trigger trg_normalize_audit_action (0006_security_fixes.sql
    // §17) lowercases the action on INSERT, so the stored value is
    // always 'auth_failed'.
    const { error } = await supabase.rpc("write_audit_event", {
      p_action: "auth_failed",
      p_target_id: null,
      p_target_type: null,
      p_metadata: { email },
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (error) {
      // The CHECK constraint or the function may reject — log but
      // don't throw (a failed audit write must not break the login
      // error response). The brief: "no silent failures" — we log
      // here so the operator sees it in the platform logs.
      console.warn(`[auth] write_audit_event('auth_failed') failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[auth] failed to record auth_failed: ${err instanceof Error ? err.message : String(err)}`);
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
  const rate = await checkLoginRate(supabase, email);
  if (rate.blocked) {
    return { error: `Too many failed login attempts (${rate.used}/${rate.limit} in the last hour). Please try again later.` };
  }

  // 2. Attempt sign-in.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 3. Record the failed attempt for rate-limiting.
    await recordAuthFailure(supabase, email);
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
