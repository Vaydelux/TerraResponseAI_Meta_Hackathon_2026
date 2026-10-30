import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeUsername, validateRegistration, passwordChecklist } from "./auth/registration-policy";
const sql = readFileSync("supabase/migrations/0011_explicit_data_api_grants.sql", "utf8");
describe("registration security", () => {
  const form = {
    username: "field_reporter",
    email: "field.reporter@somewhere.org",
    password: "correct horse battery staple",
    confirmation: "correct horse battery staple",
  };
  it("allows a suitable username and long, strong passphrase", () => {
    expect(validateRegistration(form)).toBeNull();
    expect(normalizeUsername(" Field_Reporter ")).toBe("field_reporter");
  });
  it("rejects invalid usernames, reserved names and inadequate passwords", () => {
    expect(validateRegistration({ ...form, username: "admin" })?.field).toBe("username");
    expect(validateRegistration({ ...form, username: "2notvalid" })?.field).toBe("username");
    expect(validateRegistration({ ...form, username: "x" })?.field).toBe("username");
    expect(validateRegistration({ ...form, password: "password123456", confirmation: "password123456" })?.field).toBe("password");
    expect(validateRegistration({ ...form, password: "field_reporter_is_a_pw", confirmation: "field_reporter_is_a_pw" })?.field).toBe("password");
  });
  it("rejects malformed email addresses, mismatches and common passwords", () => {
    expect(validateRegistration({ ...form, email: "not-an-email" })?.field).toBe("email");
    expect(validateRegistration({ ...form, email: "a..b@domain.com" })?.field).toBe("email");
    expect(validateRegistration({ ...form, confirmation: "different" })?.field).toBe("confirmPassword");
    const checks = passwordChecklist("hello", "field_reporter", form.email);
    expect(checks.length).toBe(false);
  });
  it("shares the same UI and server rules, and never promotes roles from supplied metadata", () => {
    const action = readFileSync("src/lib/auth/actions.ts", "utf8");
    const ui = readFileSync("src/app/signup/SignUpContent.tsx", "utf8");
    expect(action).toContain("validateRegistration({ username, email");
    expect(action).toContain("data: { name: username, username }");
    expect(ui).toContain('name="username"');
    expect(ui).toContain("passwordChecklist(");
    expect(action).not.toContain("data: { role:");
  });
});
describe("reviewed database grants migration", () => {
  it("leaves anon and PUBLIC ungranted and retains RLS", () => {
    const actions = sql.split("\n").filter(x => /^grant\s/i.test(x.trim()));
    expect(actions.length).toBeGreaterThan(5);
    expect(sql).not.toMatch(/grant [^;]* to anon\s*;/i);
    expect(sql).not.toMatch(/grant [^;]* to public\s*;/i);
    expect(sql).toContain("public.audit_events to service_role");
    expect(sql).toContain("public.audit_events to authenticated");
    expect(sql).not.toMatch(/disable row level security/i);
  });
  it("documents the required migration gate", () => {
    expect(sql).toContain("MUST be reviewed and applied on staging");
    expect(sql).toContain("after 0003..0010");
  });
});
describe("auth feedback accessibility", () => {
  it("uses an aria-live status and respects reduced motion", () => {
    const comp = readFileSync("src/components/auth/AuthLoadingBanner.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(comp).toContain('role="status"');
    expect(comp).toContain('aria-live="polite"');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(readFileSync("src/app/login/LoginContent.tsx", "utf8")).toContain("<AuthLoadingBanner mode=\"login\" />");
  });
});
