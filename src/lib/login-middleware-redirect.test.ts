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
  it("keeps the landing page and isolated walkthrough public when auth is configured", async () => {
    for (const path of ["/", "/demo/walkthrough"]) {
      const res = await middleware(request(path));
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    }
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
    const protectedResponse = await middleware(request("/dashboard"));
    expect(protectedResponse.headers.get("location")).toContain("/login?callbackUrl=");
  });
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

  it("keeps forgot-password, reset-password and recovery confirmation public", async () => {
    for (const path of ["/forgot-password", "/reset-password", "/auth/confirm?flow=recovery"]) {
      const response = await middleware(request(path));
      expect(response.headers.get("location")).toBeNull();
    }
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("does not guard the recoverable account-unavailable page", async () => {
    const res = await middleware(request("/account-unavailable"));
    expect(res.headers.get("location")).toBeNull();
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("serves only explicitly public brand and demo assets without requesting a session", async () => {
    const assets = [
      "/logo.svg",
      "/icon.svg",
      "/favicon.ico",
      "/robots.txt",
      "/demo/flood-aerial.png",
      "/brand/readme-banner.svg",
      "/hero/terraresponse-poster.jpg",
      "/hero/terraresponse-bg.mp4",
      "/assets/aistudio/image_25e22ba9.png",
    ];
    for (const path of assets) {
      const result = await middleware(request(path));
      expect(result.headers.get("location"), path).toBeNull();
      expect(result.status, path).toBe(200);
    }
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("does not blindly allow private routes merely because a path has a file extension", async () => {
    for (const path of ["/dashboard/private.svg", "/reports/internal.png", "/review/data.json"]) {
      const result = await middleware(request(path));
      expect(result.headers.get("location"), path).toContain("/login?callbackUrl=");
    }
    expect(mocks.refreshSupabaseSession).toHaveBeenCalledTimes(3);
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
