// @vitest-environment node
// Real login failures happen before authentication, so the server must
// use privileged audit access for counting and recording failed attempts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  gte: vi.fn(),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: mocks.signInWithPassword, getUser: mocks.getUser },
  }),
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: () => "https://test.supabase.co",
  serviceRoleKey: () => "server-only-test-key",
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signInAction } from "./actions";

function loginForm() {
  const form = new FormData();
  form.set("email", "Tester@Example.com");
  form.set("password", "wrong-password");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LOGIN_RATE_LIMIT_PER_HOUR;
  mocks.gte.mockResolvedValue({ count: 0, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  const query = {
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    gte: mocks.gte,
  };
  mocks.from.mockImplementation(() => ({
    select: vi.fn().mockReturnValue(query),
    insert: mocks.insert,
  }));
  mocks.createClient.mockImplementation(() => ({ from: mocks.from }));
  mocks.signInWithPassword.mockResolvedValue({ error: { message: "Invalid credentials" } });
  mocks.headers.mockResolvedValue(new Headers({
    "x-forwarded-for": "192.0.2.1, 198.51.100.1",
    "user-agent": "test-browser",
  }));
});

describe("email-only sign-in and verified redirect", () => {
  it("rejects a display username before calling Supabase or consuming the rate limiter", async () => {
    const fd = loginForm();
    fd.set("email", "Vaydelux");
    const result = await signInAction(fd);
    expect(result?.error).toContain("registered email address");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a login without an issued session instead of redirecting to a login loop", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    const fd = loginForm();
    const result = await signInAction(fd);
    expect(result?.error).toContain("session could not be established");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("refuses redirect when session verification fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "test-only" } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: "bad_jwt" } });
    const fd = loginForm();
    const result = await signInAction(fd);
    expect(result?.error).toContain("session could not be verified");
  });

  it("redirects only after successful authentication and verified identity", async () => {
    const { redirect } = await import("next/navigation");
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "test-only" } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const fd = loginForm();
    fd.set("callbackUrl", "/dashboard?tab=review");
    await signInAction(fd);
    expect(redirect).toHaveBeenCalledWith("/dashboard?tab=review");
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
});

describe("pre-authentication login protection", () => {
  it("queries the admin-only audit table through the trusted server client", async () => {
    await signInAction(loginForm());
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "server-only-test-key",
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
      })
    );
    expect(mocks.from).toHaveBeenCalledWith("audit_events");
    expect(mocks.gte).toHaveBeenCalledOnce();
  });

  it("records invalid logins with a fixed action and null actor_id", async () => {
    const result = await signInAction(loginForm());
    expect(result?.error).toContain("Invalid email or password");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: "auth_failed",
      actor_id: null,
      metadata: { email: "tester@example.com" },
      ip: "192.0.2.1",
      user_agent: "test-browser",
    }));
  });

  it("blocks repeated failures before attempting authentication", async () => {
    mocks.gte.mockResolvedValue({ count: 10, error: null });
    const result = await signInAction(loginForm());
    expect(result?.error).toContain("Too many failed login attempts");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("fails closed instead of bypassing the limiter when the audit query fails", async () => {
    mocks.gte.mockResolvedValue({ count: null, error: { message: "permission denied" } });
    const result = await signInAction(loginForm());
    expect(result?.error).toContain("temporarily unavailable");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
