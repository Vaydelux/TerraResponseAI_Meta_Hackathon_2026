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
  it("does not auto-redirect a visitor from /login to /dashboard", async () => {
    const res = await middleware(request("/login?callbackUrl=%2Fdashboard"));
    expect(res.headers.get("location")).toBeNull();
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("never bounces a previously authenticated visitor from /login to /dashboard", async () => {
    // The login route is public by design; a valid cookie does NOT prove
    // profile / membership RLS reads work. A redirect here causes a 307
    // cycle when the dashboard sends such accounts back to login.
    mocks.refreshSupabaseSession.mockImplementation(async (req: NextRequest) => ({
      response: NextResponse.next({ request: req }),
      user: { id: "user-1" },
    }));
    const res = await middleware(request("/login?callbackUrl=%2Fdashboard"));
    expect(res.headers.get("location")).toBeNull();
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("does not guard the recoverable account-unavailable page", async () => {
    const res = await middleware(request("/account-unavailable"));
    expect(res.headers.get("location")).toBeNull();
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
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
