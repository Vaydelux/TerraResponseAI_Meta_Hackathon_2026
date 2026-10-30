// src/lib/ai/sam.smoke.test.ts
//
// OPT-IN live API integration smoke test for the SAM 3.1 segmentation
// API. This test calls the REAL Meta SAM 3.1 endpoint with a small
// test image + a clear segmentation prompt. It's gated by
// SAM_API_KEY — it skips automatically when the key is not set (the
// sandbox).
//
// To run: set SAM_API_KEY in .env, then:
//   bun run test -- sam.smoke
//
// Per the brief: "a clearly separated opt-in live API integration
// smoke test." This file is SEPARATE from the unit tests so the
// default `bun run test` never calls the real API. The muse-spark
// smoke test is in muse-spark.smoke.test.ts (also opt-in).

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { segmentImage } from "@/lib/ai/sam";

const SKIP = !process.env.SAM_API_KEY;

describe.skipIf(SKIP)("SAM 3.1 live smoke test", () => {
  it("produces a mask (or a no_match) from a real photo", async () => {
    // Generate a small test image with a clear shape (a red square
    // on a white background). The SAM 3.1 model should segment the
    // square.
    const testImage = await sharp({
      create: {
        width: 200, height: 200, channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{
        input: Buffer.from(
          // A 50x50 red square at (75, 75).
          // sharp doesn't easily generate a composite from a
          // per-pixel array; we use raw RGB.
          (() => {
            const px = Buffer.alloc(200 * 200 * 3, 0xff);
            // Black out the center 50x50 region, then paint it red.
            for (let y = 75; y < 125; y++) {
              for (let x = 75; x < 125; x++) {
                const off = (y * 200 + x) * 3;
                px[off] = 255; px[off + 1] = 0; px[off + 2] = 0;
              }
            }
            return px;
          })(),
        ),
        top: 0, left: 0, raw: { width: 200, height: 200, channels: 3 },
      }])
      .jpeg()
      .toBuffer();

    const result = await segmentImage({
      imageBytes: new Uint8Array(testImage),
      imageMimeType: "image/jpeg",
      prompt: "the red square in the center",
      timeoutMs: 60_000,
    });

    if (!result.ok) {
      throw new Error(`SAM live smoke failed (${result.kind}): ${result.error}`);
    }

    // If the API succeeded, the mask must be a non-empty RLE string OR
    // a clearly-empty result (the model may classify the red square as
    // no_match if its threshold is conservative).
    expect(result.rle.length).toBeGreaterThan(0);
    console.log("[sam smoke] mask RLE length:", result.rle.length);
    console.log("[sam smoke] score:", result.score);
    console.log("[sam smoke] modelId:", result.modelId);
  }, 90_000);
});
