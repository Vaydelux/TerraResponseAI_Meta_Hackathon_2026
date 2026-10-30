import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");
describe("TerraResponse signup and favicon integration", () => {
  it("exposes signup to unauthenticated visitors and links from login", () => {
    expect(read("middleware.ts")).toContain('"/signup"');
    expect(read("src/app/login/LoginContent.tsx")).toContain('href="/signup"');
    expect(read("src/app/signup/SignUpContent.tsx")).toContain('href="/login"');
  });
  it("checks secret-aware config on the server and does not expose privileged keys to a client", () => {
    const page = read("src/app/signup/page.tsx");
    const client = read("src/app/signup/SignUpContent.tsx");
    expect(page).toContain('configured={isSupabaseConfigured()}');
    expect(client).not.toContain("process.env");
    expect(client).not.toContain("serviceRoleKey(");
  });
  it("provides both real ICO bytes and matching local SVG branding", () => {
    const ico = "src/app/favicon.ico";
    expect(existsSync(ico)).toBe(true);
    expect(statSync(ico).size).toBeGreaterThan(100);
    const header = readFileSync(ico).subarray(0, 4);
    expect([...header]).toEqual([0, 0, 1, 0]); // Windows ICO signature
    expect(read("src/app/icon.svg")).toContain("<svg");
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("/favicon.ico");
    expect(layout).toContain("/icon.svg");
    expect(layout).not.toContain("z-cdn.chatglm.cn");
  });
});
