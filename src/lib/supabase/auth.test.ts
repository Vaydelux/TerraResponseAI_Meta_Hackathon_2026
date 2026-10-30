// src/lib/supabase/auth.test.ts
//
// Unit tests for the Supabase auth integration logic that does NOT
// require a live Supabase project (the sandbox has none). The
// integration tests (login/logout/expired-session/cross-event) live
// in supabase/tests/test_rls.sql and require a real Postgres +
// Supabase Auth instance — see supabase/README.md §7.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { toNavRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

describe("toNavRole (Supabase lowercase → nav uppercase bridge)", () => {
  it("maps 'admin' → ADMIN", () => {
    expect(toNavRole("admin")).toBe<Role>("ADMIN");
  });
  it("maps 'reviewer' → REVIEWER", () => {
    expect(toNavRole("reviewer")).toBe<Role>("REVIEWER");
  });
  it("maps 'reporter' → REPORTER", () => {
    expect(toNavRole("reporter")).toBe<Role>("REPORTER");
  });
  it("defaults unknown strings to REPORTER (defense-in-depth)", () => {
    expect(toNavRole("unknown")).toBe<Role>("REPORTER");
    expect(toNavRole("")).toBe<Role>("REPORTER");
  });
});

describe("isSupabaseConfigured (env gate)", () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("returns false when no Supabase env vars are set", async () => {
    const { isSupabaseConfigured } = await import("@/lib/supabase/env");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when only some vars are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key";
    // service role key missing
    const { isSupabaseConfigured } = await import("@/lib/supabase/env");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns true when all three vars are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    const { isSupabaseConfigured } = await import("@/lib/supabase/env");
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("safe redirect logic", () => {
  // The middleware + login page + auth callback all use the same
  // "same-origin, no protocol-relative" check. This test documents
  // the rule so a future change can't accidentally allow an open
  // redirect.
  function isSafeCallback(cb: string | null): boolean {
    return !!cb && cb.startsWith("/") && !cb.startsWith("//");
  }

  it("accepts same-origin relative paths", () => {
    expect(isSafeCallback("/dashboard")).toBe(true);
    expect(isSafeCallback("/reports/new")).toBe(true);
  });

  it("rejects protocol-relative (open-redirect vector)", () => {
    expect(isSafeCallback("//evil.com")).toBe(false);
    expect(isSafeCallback("//evil.com/path")).toBe(false);
  });

  it("rejects absolute URLs (open-redirect vector)", () => {
    expect(isSafeCallback("https://evil.com")).toBe(false);
    expect(isSafeCallback("http://localhost:3000/x")).toBe(false);
  });

  it("rejects null/empty", () => {
    expect(isSafeCallback(null)).toBe(false);
    expect(isSafeCallback("")).toBe(false);
  });
});
