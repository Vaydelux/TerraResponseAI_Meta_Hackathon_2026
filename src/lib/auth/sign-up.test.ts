// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  signUp: vi.fn(),
  serverClient: vi.fn(),
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isConfigured,
  supabaseUrl: () => "https://example.supabase.co",
  serviceRoleKey: () => "server-test-key",
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.serverClient,
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signUpAction } from "./actions";

function form(email = "first@example.com", password = "correct horse battery staple", confirm = password) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("confirmPassword", confirm);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.isConfigured.mockReturnValue(true);
  mocks.signUp.mockResolvedValue({ data: { user: { id: "new-user" }, session: null }, error: null });
  mocks.serverClient.mockResolvedValue({ auth: { signUp: mocks.signUp } });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://terra-response-ai.vercel.app");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
});
describe("contributor-only Supabase sign-up", () => {
  it("signs up using server-side SSR and a trusted confirmation callback", async () => {
    const result = await signUpAction(form("  First@Example.com "));
    expect(result.status).toBe("success");
    expect(mocks.signUp).toHaveBeenCalledOnce();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "first@example.com",
      password: "correct horse battery staple",
      options: { emailRedirectTo: "https://terra-response-ai.vercel.app/auth/callback" },
    });
    expect(JSON.stringify(mocks.signUp.mock.calls[0][0])).not.toContain("admin");
    expect(JSON.stringify(mocks.signUp.mock.calls[0][0])).not.toContain("reviewer");
  });
  it("validates email, matching passwords and minimum length before calling Supabase", async () => {
    expect((await signUpAction(form("bad", "correct horse battery staple"))).status).toBe("error");
    expect((await signUpAction(form("first@example.com", "weak"))).status).toBe("error");
    expect((await signUpAction(form("first@example.com", "correct horse battery staple", "different"))).status).toBe("error");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("fails closed when auth is not configured", async () => {
    mocks.isConfigured.mockReturnValue(false);
    const result = await signUpAction(form());
    expect(result.status).toBe("error");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("does not disclose internal provider details or account existence", async () => {
    mocks.signUp.mockResolvedValue({ data: null, error: { code: "user_already_exists", status: 400, message: "registered user details" } });
    const result = await signUpAction(form());
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("user_already_exists");
    expect(JSON.stringify(result)).not.toContain("registered user details");
  });
  it("rejects unsafe configurable redirect origins", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://evil.example/path?redirect=https://evil.example");
    await signUpAction(form());
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "first@example.com",
      password: "correct horse battery staple",
    }));
    expect(mocks.signUp.mock.calls[0][0]).not.toHaveProperty("options");
  });
});
