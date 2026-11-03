import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("paid auxiliary inference and observation provenance safeguards", () => {
  it("requires reviewer access before an optional paid SAM call", () => {
    const sam = source("src/app/api/reports/[id]/segment/route.ts");
    const roleGate = sam.indexOf('ctx.user.role !== "reviewer"');
    const modelCall = sam.indexOf("const result = await segmentImage");
    expect(roleGate).toBeGreaterThan(0);
    expect(modelCall).toBeGreaterThan(roleGate);
    expect(sam.indexOf("await checkAllAiCallCeilings")).toBeLessThan(modelCall);
    expect(sam).toContain("await logUsage");
    expect(sam).toContain("SEGMENTATION_COOLDOWN");
  });

  it("persists overlays in metadata without mutating a schema-strict Meta observation", () => {
    const sam = source("src/app/api/reports/[id]/segment/route.ts");
    expect(sam).toContain("raw_usage_metadata");
    expect(sam).toContain("_sam_overlay: overlayData");
    expect(sam).not.toContain("structured_observation: updated");
    expect(sam).not.toContain(".update({ structured_observation:");
    const ctx = source("src/app/api/reports/[id]/context/route.ts");
    expect(ctx).toContain("raw_usage_metadata:");
    expect(ctx).not.toContain("structured_observation: {");
    expect(ctx).toContain("refreshCooldownMs");
  });

  it("cannot silently imply a location or a live grounded source", () => {
    const ai = source("src/lib/ai/contextual-intelligence.ts");
    expect(ai).toContain('return "Location not provided"');
    expect(ai).toContain("if (sources.length === 0) return buildFallbackIntelligence(input)");
    expect(ai).not.toContain("Active meteorological monitoring in effect");
    expect(ai).not.toContain("Metro Manila / Philippines operational sector");
    const card = source("src/components/review/ContextualIntelligenceCard.tsx");
    expect(card).toContain("Live sources not verified");
    expect(card).toContain("No independently retrieved live advisories");
  });
});
