// src/lib/supabase/client.ts
//
// Browser-side Supabase client factory using @supabase/ssr's
// createBrowserClient. Use this in Client Components for auth
// (signInWithPassword, signOut, getSession) and client-side RLS
// queries.
//
// This module is safe to import from "use client" components because
// createBrowserClient is designed for the browser. The env vars
// (NEXT_PUBLIC_*) are inlined at build time.

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "./env";

/**
 * Browser Supabase client. Memoized per page load (a single client
 * is reused). Returns null when Supabase is not configured; callers
 * should check isSupabaseConfigured() first and render a setup state.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return browserClient;
}

export { isSupabaseConfigured };
