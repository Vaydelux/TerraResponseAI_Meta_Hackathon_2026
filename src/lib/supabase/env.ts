// src/lib/supabase/env.ts
//
// Centralized Supabase env-var access. Reads at CALL TIME (not module
// load) so tests can stub process.env and re-check. Every other
// Supabase file imports from here so the env access is in one place
// and the "is Supabase configured?" check is a single function call.

/**
 * The public Supabase project URL (safe for the browser — it's in the
 * NEXT_PUBLIC_ namespace). Empty when Supabase is not configured.
 * Read at call time so tests can stub process.env.
 */
export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/**
 * The anon (public) Supabase key. Safe for the browser — it's in the
 * NEXT_PUBLIC_ namespace. RLS is the real boundary; the anon key only
 * identifies the project. Empty when Supabase is not configured.
 */
export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

/**
 * The service-role key. NEVER expose this to the browser. It bypasses
 * RLS and must only be used server-side (route handlers, server
 * actions, the retry poller). Empty when Supabase is not configured.
 */
export function serviceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/**
 * True when all three Supabase env vars are non-empty. The app uses
 * this to decide whether to wire real Supabase auth or show a setup
 * state on /login (the sandbox has no Supabase project).
 */
export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl().length > 0 &&
    supabaseAnonKey().length > 0 &&
    serviceRoleKey().length > 0
  );
}
