import { describe, expect, it } from "vitest";
import { signupFailure } from "./signup-error";

describe("privacy-preserving Supabase sign-up error explanations", () => {
  it("explains the exact live email_address_invalid error", () => {
    expect(signupFailure("email_address_invalid", 400)).toEqual({
      field: "email",
      message: expect.stringContaining("deliverable inbox"),
    });
  });
  it("distinguishes disabled provider, restricted email delivery and throttling", () => {
    expect(signupFailure("email_provider_disabled", 400).message).toMatch(/disabled/);
    expect(signupFailure("signup_disabled", 403).message).toMatch(/disabled/);
    expect(signupFailure("email_address_not_authorized", 422).field).toBe("email");
    expect(signupFailure("over_email_send_rate_limit", 429).message).toMatch(/email confirmation quota/);
    expect(signupFailure(undefined, 429).message).toMatch(/too many/i);
  });
  it("never discloses whether an account already exists", () => {
    const a = signupFailure("email_exists", 422).message;
    const b = signupFailure("user_already_exists", 400).message;
    expect(a).toBe(b);
    expect(a).toMatch(/if this email/i);
  });
  it("falls back safely for internal and unknown provider failures", () => {
    expect(signupFailure("unexpected_failure", 500).message).toMatch(/contact the administrator/);
    expect(signupFailure("weak_password", 422).field).toBe("password");
  });
});
