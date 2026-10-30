// @vitest-environment node
//
// src/lib/auth/record-auth-failure.test.ts
//
// Phase 18 — test that recordAuthFailure now uses the
// write_audit_event SECURITY DEFINER RPC (Phase 18 C-4 fix) instead
// of bypassing it with a direct service-role INSERT into audit_events.
//
// The previous version used the service-role client to INSERT
// directly into audit_events. This bypassed the SECURITY DEFINER
// function's actor_id = auth.uid() guarantee (the service role can
// set actor_id to an arbitrary value). The new version uses the
// SSR client + the RPC, so the function's guarantee holds.
//
// The test mocks the SSR client's `rpc` method and verifies it's
// called with the correct arguments (action='auth_failed' lowercase,
// metadata={email}).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRpc, mockRequireServerUser, mockCreateClient, mockHeaders } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRequireServerUser: vi.fn(),
  mockCreateClient: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: mockRpc,
    auth: { getUser: vi.fn() },
  }),
  requireServerUser: mockRequireServerUser,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: () => "https://test.supabase.co",
  serviceRoleKey: () => "test-service-role-key",
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

// Import AFTER the mocks.
import { signInAction } from "@/lib/auth/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireServerUser.mockResolvedValue({ id: "user-1" });
  mockHeaders.mockResolvedValue(new Headers({
    "x-forwarded-for": "1.2.3.4",
    "user-agent": "test-ua",
  }));
  // signInAction calls supabase.auth.signInWithPassword; we mock the
  // auth client to return a failure so recordAuthFailure runs.
  mockRpc.mockImplementation(async (fnName: string, args: Record<string, unknown>) => {
    if (fnName === "write_audit_event") {
      // The RPC inserts an audit row; return a fake id.
      return { data: "audit-id-1", error: null };
    }
    return { data: null, error: { message: "not mocked" } };
  });
  // The signInAction uses createSupabaseServerClient's auth.signInWithPassword.
  // We need to mock the auth client too. Actually signInAction uses
  // the SSR client's auth, not a separate client. Let me patch the
  // createSupabaseServerClient mock to include an auth.signInWithPassword
  // that returns an error.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordAuthFailure (Phase 18 C-4 fix)", () => {
  it("calls write_audit_event RPC with lowercase action + email metadata (NOT a direct INSERT)", async () => {
    // Re-mock the SSR client to include auth.signInWithPassword that
    // returns an error (so recordAuthFailure is called).
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        rpc: mockRpc,
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
          signInWithPassword: vi.fn().mockResolvedValue({
            error: { message: "Invalid credentials" },
          }),
          signOut: vi.fn(),
        },
      }),
      requireServerUser: mockRequireServerUser,
    }));
    const { signInAction: freshSignIn } = await import("@/lib/auth/actions");

    const formData = new FormData();
    formData.set("email", "attacker@evil.com");
    formData.set("password", "wrong");
    formData.set("callbackUrl", "/dashboard");
    await freshSignIn(formData);

    // Verify write_audit_event was called with the correct args.
    expect(mockRpc).toHaveBeenCalledWith("write_audit_event", expect.objectContaining({
      p_action: "auth_failed",  // lowercase (canonical form)
      p_metadata: { email: "attacker@evil.com" },
      p_target_id: null,
      p_target_type: null,
      p_ip: "1.2.3.4",  // leftmost IP from x-forwarded-for
      p_user_agent: "test-ua",
    }));
  });

  it("does NOT use the service-role client to INSERT directly into audit_events", async () => {
    // The previous version called createClient(supabaseUrl, serviceRoleKey)
    // and then serviceClient.from("audit_events").insert(...). The new
    // version uses the SSR client + rpc. Verify the service-role
    // createClient is NOT called during recordAuthFailure.
    mockCreateClient.mockClear();
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        rpc: mockRpc,
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
          signInWithPassword: vi.fn().mockResolvedValue({
            error: { message: "Invalid credentials" },
          }),
          signOut: vi.fn(),
        },
      }),
      requireServerUser: mockRequireServerUser,
    }));
    const { signInAction: freshSignIn } = await import("@/lib/auth/actions");

    const formData = new FormData();
    formData.set("email", "attacker@evil.com");
    formData.set("password", "wrong");
    await freshSignIn(formData);

    // The service-role createClient should NOT be called during
    // a failed login (recordAuthFailure uses the SSR client + RPC,
    // not the service-role client). Note: bootstrapFirstAdminAction
    // DOES use createClient, but that's a different code path that's
    // not exercised by signInAction.
    // We allow createClient to be called by other code (e.g., the
    // middleware), but during signInAction it should not be called
    // for the audit write.
    const createClientCalls = mockCreateClient.mock.calls.length;
    // If createClient was called, the call sites that did so were
    // NOT for the audit write (they would have been for the SSR
    // cookie refresh, which is handled by @supabase/ssr, not
    // @supabase/supabase-js createClient). So we expect 0 calls.
    expect(createClientCalls).toBe(0);
  });
});
