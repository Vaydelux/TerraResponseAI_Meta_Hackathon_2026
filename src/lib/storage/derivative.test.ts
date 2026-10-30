// @vitest-environment node
//
// src/lib/storage/derivative.test.ts
//
// Tests for the image derivative generator (Sharp).
// These tests actually invoke sharp (no mock) because:
//   1. Sharp is a native Node lib; mocking it would defeat the
//      purpose of testing the EXIF-strip + resize.
//   2. The tests run in Node (vitest's default), not jsdom.
//   3. The test images are synthesized in-memory (no fixtures on disk).
// Per the brief: "Strip EXIF metadata from derivatives by default."
//
// NOTE: This test file uses the NODE environment because sharp +
// exifr need real Buffers; jsdom's Buffer polyfill breaks them.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeDerivatives } from "@/lib/storage/derivative";

async function makeTestImage(opts?: {
  width?: number;
  height?: number;
  withExif?: boolean;
}): Promise<Buffer> {
  const w = opts?.width ?? 200;
  const h = opts?.height ?? 200;
  let img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 100, g: 100, b: 100 } },
  }).jpeg({ quality: 80 });
  if (opts?.withExif) {
    // Inject a fake EXIF payload so we can verify the derivative
    // strips it. sharp.withExif requires STRING values.
    img = img.withExif({
      IFD0: { Make: "TestCamera", DateTimeOriginal: "2024:09:15 12:34:56" },
      IFD3: {
        GPSLatitude: "35/1 0/1 0/1",
        GPSLatitudeRef: "N",
        GPSLongitude: "82/1 0/1 0/1",
        GPSLongitudeRef: "W",
      },
    });
  }
  return img.toBuffer();
}

describe("makeDerivatives", () => {
  it("produces both a derivative and a thumbnail buffer", async () => {
    const original = await makeTestImage();
    const r = await makeDerivatives(new Uint8Array(original));
    expect(r.derivative).toBeInstanceOf(Buffer);
    expect(r.thumbnail).toBeInstanceOf(Buffer);
    expect(r.derivative.length).toBeGreaterThan(0);
    expect(r.thumbnail.length).toBeGreaterThan(0);
  });

  it("derivative is always JPEG (regardless of input format)", async () => {
    const original = await makeTestImage();
    const r = await makeDerivatives(new Uint8Array(original));
    // JPEG magic bytes: FF D8 FF
    expect(r.derivative[0]).toBe(0xff);
    expect(r.derivative[1]).toBe(0xd8);
    expect(r.derivative[2]).toBe(0xff);
    expect(r.thumbnail[0]).toBe(0xff);
    expect(r.thumbnail[1]).toBe(0xd8);
    expect(r.thumbnail[2]).toBe(0xff);
  });

  it("derivative dimensions are <= 1600px on the long edge", async () => {
    // Upload a 4000x2000 image; the derivative should be downscaled
    // to at most 1600px wide and proportionally tall.
    const original = await makeTestImage({ width: 4000, height: 2000 });
    const r = await makeDerivatives(new Uint8Array(original));
    expect(r.derivativeWidth).toBeLessThanOrEqual(1600);
    expect(r.derivativeHeight).toBeLessThanOrEqual(1600);
    // Aspect ratio roughly preserved: 4000/2000 = 2; 1600/x = 2 → x=800.
    expect(r.derivativeWidth).toBe(1600);
    expect(r.derivativeHeight).toBe(800);
  });

  it("thumbnail dimensions are <= 400px on the long edge", async () => {
    const original = await makeTestImage({ width: 2000, height: 1000 });
    const r = await makeDerivatives(new Uint8Array(original));
    const thumbMeta = await sharp(r.thumbnail).metadata();
    expect((thumbMeta.width ?? 0)).toBeLessThanOrEqual(400);
    expect((thumbMeta.height ?? 0)).toBeLessThanOrEqual(400);
  });

  it("does NOT enlarge a small original (withoutEnlargement)", async () => {
    const original = await makeTestImage({ width: 100, height: 100 });
    const r = await makeDerivatives(new Uint8Array(original));
    expect(r.derivativeWidth).toBe(100);
    expect(r.derivativeHeight).toBe(100);
  });

  it("strips EXIF from the derivative (no GPS, no Make tag)", async () => {
    const original = await makeTestImage({ withExif: true });
    const r = await makeDerivatives(new Uint8Array(original));
    const meta = await sharp(r.derivative).metadata();
    // exif should be absent (Sharp strips it on re-encode by default
    // unless explicitly preserved).
    expect(meta.exif).toBeUndefined();
  });

  it("strips EXIF from the thumbnail", async () => {
    const original = await makeTestImage({ withExif: true });
    const r = await makeDerivatives(new Uint8Array(original));
    const meta = await sharp(r.thumbnail).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("reports the derivative's final dimensions (post-resize)", async () => {
    const original = await makeTestImage({ width: 3000, height: 1000 });
    const r = await makeDerivatives(new Uint8Array(original));
    expect(r.derivativeWidth).toBe(1600);
    expect(r.derivativeHeight).toBeCloseTo(533, -2); // 1000/3000 * 1600 ≈ 533
  });
});
