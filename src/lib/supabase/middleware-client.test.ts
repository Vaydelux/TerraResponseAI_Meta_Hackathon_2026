// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: () => "https://example.supabase.co",
  supabaseAnonKey: () => "test-anon",
}));

import { refreshSupabaseSession } from "./middleware-client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerClient.mockReturnValue({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  });
});

describe("Supabase middleware session resilience", () => {
  const request = () => new NextRequest("https://example.vercel.app/login");

  it("does not call getSession after verified getUser", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "account-1", email: "reporter@example.org" } },
      error: null,
    });
    const result = await refreshSupabaseSession(request());
    expect(result.user).toEqual({ id: "account-1", email: "reporter@example.org" });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("propagates refreshed cookie to the downstream Server Component and browser", async () => {
    mocks.createServerClient.mockImplementation((_url: string, _key: string, options: {
      cookies: { setAll: (value: Array<{ name: string; value: string; options: { path: string } }>, headers: Record<string, string>) => void };
    }) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            { name: "sb-staging-auth-token", value: "refreshed", options: { path: "/" } },
          ], { "cache-control": "private, no-store" });
          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
    }));
    const req = request();
    const result = await refreshSupabaseSession(req);
    expect(req.cookies.get("sb-staging-auth-token")?.value).toBe("refreshed");
    expect(result.response.cookies.get("sb-staging-auth-token")?.value).toBe("refreshed");
    expect(result.response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.response.headers.get("x-middleware-request-cookie")).toContain("sb-staging-auth-token");
  });

  it("keeps the login page recoverable when Auth is temporarily unavailable", async () => {
    mocks.getUser.mockRejectedValue(new Error("Simulated network outage"));
    const result = await refreshSupabaseSession(request());
    expect(result.user).toBeNull();
    expect(result.response).toBeDefined();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("denies a session with provider verification failure", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: "bad_jwt" },
    });
    const result = await refreshSupabaseSession(request());
    expect(result.user).toBeNull();
  });
});
