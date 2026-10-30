import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = readFileSync("supabase/config.toml", "utf8");
const workflow = readFileSync(".github/workflows/supabase-staging-preview.yml", "utf8");

function section(name: string): string {
  const header = "[" + name + "]";
  const start = config.indexOf(header);
  if (start === -1) throw new Error("Missing Supabase section: " + name);
  const next = config.indexOf("\n[", start + header.length);
  return config.slice(start, next === -1 ? undefined : next);
}

describe("Supabase CLI 2.72.7 config compatibility", () => {
  it("requires a nonempty local project_id that is NOT the remote staging reference", () => {
    expect(config).toMatch(/^project_id\s*=\s*"terraresponse-ai"$/m);
    expect(config).not.toMatch(/^project_id\s*=\s*""$/m);
  });

  it("avoids settings rejected by the pinned CLI", () => {
    expect(section("db")).not.toMatch(/^enabled\s*=/m);
    expect(section("db.migrations")).not.toMatch(/^dir\s*=/m);
    expect(section("storage")).not.toMatch(/^port\s*=/m);
    expect(section("auth")).not.toMatch(/^port\s*=/m);
    expect(section("auth")).not.toMatch(/^refresh_token_rotation_enabled\s*=/m);
  });
  it("preserves the opt-in, read-only and staging-scoped workflow", () => {
    expect(workflow).toContain("supabase/config.toml");
    expect(workflow).toContain("supabase db push --dry-run --linked");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
  });
});
