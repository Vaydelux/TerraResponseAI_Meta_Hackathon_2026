import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fetchContextualIntelligence } from "./contextual-intelligence";

afterEach(() => vi.unstubAllEnvs());

describe("safe disaster context without verified live grounding", () => {
  it("does not invent a city, weather alert, news item or source for an unknown location", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await fetchContextualIntelligence({
      incidentType: "flooding", latitude: null, longitude: null, locationLabel: null,
    });
    expect(result.locationContext).toBe("Location not provided");
    expect(result.grounded).toBe(false);
    expect(result.modelId).toBe("contextual-standby-v1");
    expect(result.summary).toContain("No independently retrieved");
    expect(result.weatherAlerts).toEqual([]);
    expect(result.localNewsAndAdvisories).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.searchQueries).toEqual([]);
  });

  it("gives an accurate standby state when external provider credentials are absent", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await fetchContextualIntelligence({
      locationLabel: "Test community", incidentType: "blocked_road",
    });
    expect(result.grounded).toBe(false);
    expect(result.summary).toContain("Test community");
    expect(result.sources).toHaveLength(0);
    expect(result.weatherAlerts).toHaveLength(0);
  });

  it("does not make a paid geographic search with a fabricated fallback location", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key-set-but-location-unknown");
    const result = await fetchContextualIntelligence({});
    expect(result.grounded).toBe(false);
    expect(result.locationContext).toBe("Location not provided");
  });

  it("keeps external intelligence outside the strict Meta observation data and reviewer-only", () => {
    const route = readFileSync("src/app/api/reports/[id]/context/route.ts", "utf8");
    const obs = readFileSync("src/lib/ai/observation-schema.ts", "utf8");
    expect(obs).toContain("}).strict()");
    expect(route).toContain("ctx.user.role !== \"reviewer\"");
    expect(route).toContain("raw_usage_metadata:");
    expect(route).not.toContain("structured_observation: {");
    expect(route).toContain("refreshCooldownMs");
  });
});
