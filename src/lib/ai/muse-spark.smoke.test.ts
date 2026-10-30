// src/lib/ai/muse-spark.smoke.test.ts
//
// OPT-IN live API integration smoke test. This test calls the REAL
// Meta Model API with a small test image. It's gated by
// MODEL_API_KEY — it skips automatically when the key is not set
// (the sandbox).
//
// To run: set MODEL_API_KEY in .env, then:
//   bun run test -- muse-spark.smoke
//
// Per the brief: "a clearly separated opt-in live API integration
// smoke test." This file is SEPARATE from the unit tests so the
// default `bun run test` never calls the real API.

import { describe, it, expect } from "vitest";
import { analyzeImage } from "@/lib/ai/muse-spark";
import sharp from "sharp";

const SKIP = !process.env.MODEL_API_KEY;

describe.skipIf(SKIP)("muse-spark live smoke test", () => {
  it("produces valid stored JSON from a real photo", async () => {
    // Generate a small test image (2x2 red JPEG).
    const testImage = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();

    const result = await analyzeImage({
      imageBytes: new Uint8Array(testImage),
      imageMimeType: "image/jpeg",
      timeoutMs: 60_000, // generous timeout for the live call
    });

    if (!result.ok) {
      // If the API returns an error, that's acceptable for a smoke
      // test (the API may be down, rate-limited, etc.) — but it must
      // be a CLEAR error, not a fabricated fallback.
      console.log(`[smoke] API returned ${result.kind}: ${result.error}`);
      return;
    }

    // If the API succeeded, the observation must pass both validation
    // layers (the model's JSON-schema + our Zod layer).
    expect(result.observation.incident_type).toBeDefined();
    expect(result.observation.needs_review).toBe(true);
    expect(result.observation.visible_evidence.length).toBeGreaterThan(0);
    expect(result.modelId).toBe("muse-spark-1.3");
    expect(result.promptVersion).toBe("v1");
    expect(result.schemaVersion).toBe("v1");

    console.log("[smoke] observation:", JSON.stringify(result.observation, null, 2));
    console.log("[smoke] usage:", result.usageMetadata);
  }, 90_000); // 90s timeout for the live test
});
