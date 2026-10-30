import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (name: string) =>
  readFileSync(resolve(process.cwd(), "src/components/landing", name), "utf8");

describe("Hackathon public-demo integrity", () => {
  it("never presents the mock map as live reports", () => {
    const map = source("MapPreview.tsx");
    expect(map).toContain("Illustrative incident-map preview");
    expect(map).toContain("Example pins only");
    expect(map).not.toContain(">Live incident map<");
  });

  it("does not present decorative rectangles as real SAM masks", () => {
    expect(source("Hero.tsx")).toContain("Illustrative highlight");
    expect(source("MetaAIShowcase.tsx")).toContain("not model-generated segmentation");
  });

  it("links to the actual repository and working page anchors", () => {
    const cta = source("FinalCTA.tsx");
    const flow = source("DemoFlow.tsx");
    const map = source("MapPreview.tsx");
    expect(cta).toContain("https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026");
    expect(cta).toContain('href="#how-it-works"');
    expect(flow).toContain('id="how-it-works"');
    expect(cta).toContain('href="#incident-map-preview"');
    expect(map).toContain('id="incident-map-preview"');
    expect(cta).not.toContain('href="/review"');
  });

  it("honors visitors' video pause, reduced-motion, and reduced-data preferences", () => {
    const video = source("CinematicHero.tsx");
    expect(video).toContain("userPaused");
    expect(video).toContain("prefers-reduced-motion");
    expect(video).toContain("prefers-reduced-data");
    expect(video).toContain("connection?.saveData");
    expect(video).toContain("IntersectionObserver");
  });
});
