import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeAuthPath } from "./auth/safe-redirect";

describe("live login deployment safety", () => {
  it("keeps server-only service role inspection out of the client component", () => {
    const client = readFileSync("src/app/login/LoginContent.tsx", "utf8");
    const page = readFileSync("src/app/login/page.tsx", "utf8");
    expect(client).not.toContain("isSupabaseConfigured");
    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(client).toContain("{ configured }: { configured: boolean }");
    expect(page).toContain("configured={isSupabaseConfigured()}");
  });
  it("accepts only path-relative callback URLs", () => {
    expect(safeAuthPath("/dashboard?tab=review")).toBe("/dashboard?tab=review");
    for (const unsafe of ["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)", "dashboard", "/\n//evil", "/\t//evil"]) {
      expect(safeAuthPath(unsafe)).toBe("/dashboard");
    }
  });
  it("requires a safe callback both on the client and server action", () => {
    expect(readFileSync("src/app/login/LoginContent.tsx", "utf8")).toContain("safeAuthPath(cbParam");
    expect(readFileSync("src/lib/auth/actions.ts", "utf8")).toContain("safeAuthPath(callbackUrl)");
  });
});
