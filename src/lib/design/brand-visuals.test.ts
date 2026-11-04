import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
function luminance(hex: string) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = v.map((x) => x <= 0.04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}

describe("TerraResponse AI visual identity", () => {
  it("reuses the exact same SVG for app icon and global wordmark", () => {
    const logo = read("public/logo.svg");
    expect(read("src/app/icon.svg")).toBe(logo);
    expect(logo).toContain("TerraResponse AI");
    expect(logo).toContain("#FF8552");
    expect(read("src/components/layout/Wordmark.tsx")).toContain('src="/logo.svg"');
  });
  it("keeps essential button and human-confirmed labels AA-readable", () => {
    expect(contrast("#0B6574", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#48B5C6", "#061D27")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#48C07A", "#061D27")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#0B6272", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const c = read("src/app/styles/components.css");
    expect(c).toContain("--btn-fg: var(--on-tide)");
    expect(read("src/app/styles/seal.css")).toContain("color: var(--on-green)");
  });
  it("aligns Night Ops and Tailwind tokens with the civic-cartographic brand palette", () => {
    const vars = read("src/app/styles/tokens.css");
    const base = read("src/app/styles/base.css");
    const comp = read("src/app/styles/components.css");
    const tw = read("tailwind.config.ts");

    expect(vars).toContain("--brand-signal: #FF8552;");
    expect(vars).toContain("--tide: #48B5C6;");
    expect(vars).toContain("--paper: #0B1217;");
    for (const fileContent of [vars, base, comp, tw]) {
      expect(fileContent).not.toMatch(/#7B2CBF|#FF416C|--accent-violet|--accent-crimson/i);
    }
  });
  it("supports system, light, and dark themes and reduces motion safely", () => {
    const themes = read("src/components/layout/ThemeToggle.tsx");
    for (const mode of ["system", "light", "dark"]) {
      expect(themes).toContain(`"${mode}"`);
    }
    const vars = read("src/app/styles/tokens.css");
    expect(vars).toContain('--t-theme: 220ms');
    const css = read("src/app/globals.css");
    expect(css).not.toContain("transition: background-color 200ms ease, border-color 200ms ease, color 150ms ease");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
  it("retains the existing security disclaimer in the README", () => {
    const readme = read("README.md");
    expect(readme).toContain("SECURITY RELEASE BLOCKER");
    expect(readme).toContain("not an emergency alert or dispatch service");
    expect(readme).toContain("docs/DESIGN.md");
  });
});
