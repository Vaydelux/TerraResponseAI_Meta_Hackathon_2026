import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const copyScript = resolve(process.cwd(), "scripts/copy-standalone-assets.mjs");

describe("portable standalone build", () => {
  it("copies Next.js assets without depending on cp, tee or Unix shell env assignment", () => {
    const project = mkdtempSync(join(tmpdir(), "terra-next-"));
    try {
      const standalone = join(project, ".next", "standalone");
      const staticDir = join(project, ".next", "static");
      const publicDir = join(project, "public");
      mkdirSync(standalone, { recursive: true });
      mkdirSync(staticDir, { recursive: true });
      mkdirSync(publicDir, { recursive: true });
      writeFileSync(join(standalone, "server.js"), "console.log('server')");
      writeFileSync(join(staticDir, "chunk.js"), "STATIC");
      writeFileSync(join(publicDir, "logo.svg"), "<svg></svg>");
      const result = spawnSync(process.execPath, [copyScript], { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(join(standalone, ".next", "static", "chunk.js"), "utf8")).toBe("STATIC");
      expect(readFileSync(join(standalone, "public", "logo.svg"), "utf8")).toBe("<svg></svg>");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("fails clearly when standalone output has not been generated", () => {
    const project = mkdtempSync(join(tmpdir(), "terra-next-missing-"));
    try {
      const result = spawnSync(process.execPath, [copyScript], { cwd: project, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Standalone server missing");
      expect(existsSync(join(project, ".next", "standalone", "server.js"))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("keeps environment-free script commands portable on Windows and Linux", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string,string> };
    expect(pkg.scripts.dev).toBe("next dev -p 3000");
    expect(pkg.scripts.build).toContain("node scripts/copy-standalone-assets.mjs");
    expect(pkg.scripts.start).toBe("node .next/standalone/server.js");
    expect(pkg.scripts["test:smoke"]).not.toContain("MODEL_API_KEY=$MODEL_API_KEY");
  });
});
