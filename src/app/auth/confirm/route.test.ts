// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: mocks.configured }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { GET } from "./route";

function request(search: string) {
  return new NextRequest("https://terra-response-ai.vercel.app/auth/confirm" + search);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.createSupabaseServerClient.mockResolvedValue({ auth: {
    verifyOtp: mocks.verifyOtp,
    exchangeCodeForSession: mocks.exchangeCodeForSession,
    getUser: mocks.getUser,
  } });
});

describe("secure password recovery callback", () => {
  it("rejects direct visits, unsupported auth types and missing flow", async () => {
    for (const path of [
      "",
      "?flow=recovery",
      "?flow=recovery&token_hash=abc&type=signup",
      "?token_hash=abc&type=recovery",
      "?flow=recovery&error=access_denied",
    ]) {
      const res = await GET(request(path));
      expect(res.headers.get("location")).toContain("/forgot-password?error=invalid_link");
      expect(res.cookies.get("tr-password-recovery")).toBeUndefined();
    }
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("verifies a one-time recovery token hash without relying on a prior browser", async () => {
    const res = await GET(request("?flow=recovery&token_hash=hash-test&type=recovery"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-test", type: "recovery" });
    expect(mocks.getUser).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://terra-response-ai.vercel.app/reset-password");
    expect(res.cookies.get("tr-password-recovery")?.value).toBe("verified");
  });

  it("also exchanges ordinary Supabase ConfirmationURL PKCE codes", async () => {
    const res = await GET(request("?flow=recovery&code=pkce-test"));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-test");
    expect(res.cookies.get("tr-password-recovery")?.value).toBe("verified");
  });

  it("never enables reset after failed verification or missing user", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "expired" } });
    const denied = await GET(request("?flow=recovery&token_hash=expired&type=recovery"));
    expect(denied.cookies.get("tr-password-recovery")).toBeUndefined();
    expect(denied.headers.get("location")).toContain("invalid_link");

    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const noSession = await GET(request("?flow=recovery&code=non-user"));
    expect(noSession.cookies.get("tr-password-recovery")).toBeUndefined();
  });
});
