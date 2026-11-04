import { describe, expect, it } from "vitest";
import {
  recoveryCallbackUrl,
  validRecoveryEmail,
  validateNewPassword,
} from "@/lib/auth/password-recovery";

describe("password recovery checks", () => {
  it("resolves a trusted canonical production redirect", () => {
    expect(recoveryCallbackUrl({ vercelEnv: "production", siteUrl: "https://terra-response-ai.vercel.app" }))
      .toBe("https://terra-response-ai.vercel.app/auth/confirm?flow=recovery");
  });
  it("uses the current preview deployment origin, never the production host", () => {
    expect(recoveryCallbackUrl({
      vercelEnv: "preview",
      vercelUrl: "demo-owned-preview.vercel.app",
      siteUrl: "https://terra-response-ai.vercel.app",
    })).toBe("https://demo-owned-preview.vercel.app/auth/confirm?flow=recovery");
  });
  it("uses localhost for development and refuses insecure production site URLs", () => {
    expect(recoveryCallbackUrl({ local: true })).toBe("http://localhost:3000/auth/confirm?flow=recovery");
    expect(() => recoveryCallbackUrl({ siteUrl: "http://evil.example" })).toThrow();
  });
  it("validates email shape without inspecting whether an account exists", () => {
    expect(validRecoveryEmail(" TEST@EXAMPLE.COM ")).toBe("test@example.com");
    expect(validRecoveryEmail("not-an-email")).toBeNull();
    expect(validRecoveryEmail("a..b@example.com")).toBeNull();
  });
  it("matches the existing password length limit and confirmation rule", () => {
    expect(validateNewPassword("a".repeat(11), "a".repeat(11))).toMatch(/12/);
    expect(validateNewPassword("x".repeat(73), "x".repeat(73))).toMatch(/72/);
    expect(validateNewPassword("password123456", "password123456")).toMatch(/predictable/);
    expect(validateNewPassword("uniquePassphrase123!", "different", "test@example.com")).toMatch(/match/);
    expect(validateNewPassword("uniquePassphrase123!", "uniquePassphrase123!", "test@example.com")).toBeNull();
  });
});
