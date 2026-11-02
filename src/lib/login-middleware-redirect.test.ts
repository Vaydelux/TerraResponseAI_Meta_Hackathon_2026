// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  refreshSupabaseSession: vi.fn(),
  configured: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware-client", () => ({
  refreshSupabaseSession: mocks.refreshSupabaseSession,
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.configured,
}));

import { middleware } from "../../middleware";

function request(path: string) {
  return new NextRequest("https://terra-response-ai.vercel.app" + path);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.refreshSupabaseSession.mockImplementation(async (req: NextRequest) => ({
    user: null,
    response: NextResponse.next({ request: req }),
  }));
});

describe("login callback and session redirect", () => {
  it("keeps an unauthenticated visitor on /login with the callback as a destination", async () => {
    const res = await middleware(request("/login?callbackUrl=%2Fdashboard"));
    expect(res.headers.get("location")).toBeNull();
    expect(mocks.refreshSupabaseSession).toHaveBeenCalledOnce();
  });

  it("redirects a verified existing session to its safe callback target", async () => {
    mocks.refreshSupabaseSession.mockImplementation(async (req: NextRequest) => {
      const response = NextResponse.next({ request: req });
      response.cookies.set("sb-test-auth-token", "refreshed", { httpOnly: true, path: "/" });
      return { user: { id: "user-1" }, response };
    });
    const res = await middleware(request("/login?callbackUrl=%2Fdashboard%3Ftab%3Dreview"));
    expect(res.headers.get("location")).toBe("https://terra-response-ai.vercel.app/dashboard?tab=review");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });

  it("ignores callback attempts to redirect authenticated users off-site or back to login", async () => {
    mocks.refreshSupabaseSession.mockImplementation(async (req: NextRequest) => ({
      response: NextResponse.next({ request: req }),
      user: { id: "user-1" },
    }));
    for (const target of ["https%3A%2F%2Fevil.example", "%2F%2Fevil.example", "%2Flogin"]) {
      const res = await middleware(request("/login?callbackUrl=" + target));
      expect(res.headers.get("location")).toBe("https://terra-response-ai.vercel.app/dashboard");
    }
  });

  it("redirects unauthenticated protected requests back to login and preserves refreshed cookies", async () => {
    mocks.refreshSupabaseSession.mockImplementation(async (req: NextRequest) => {
      const response = NextResponse.next({ request: req });
      response.cookies.set("sb-test-auth-token", "", { maxAge: 0, path: "/" });
      return { user: null, response };
    });
    const res = await middleware(request("/dashboard"));
    expect(res.headers.get("location")).toBe("https://terra-response-ai.vercel.app/login?callbackUrl=%2Fdashboard");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("");
  });
});
