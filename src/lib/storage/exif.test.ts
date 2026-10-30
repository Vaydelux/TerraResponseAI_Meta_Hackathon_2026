// @vitest-environment node
//
// src/lib/storage/exif.test.ts
//
// Tests for the EXIF reader. Real exifr (no mock) on real test images
// synthesized with sharp (no fixture files on disk). The brief:
//   - "Strip EXIF metadata from derivatives by default."
//   - The original PRESERVES EXIF so the contributor can confirm the
//     GPS location. readExif reads GPS + DateTimeOriginal.
//
// NOTE: This test file uses the NODE environment (not jsdom) because
// exifr needs a real Buffer; jsdom's Buffer polyfill breaks exifr's
// binary parser.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { readExif } from "@/lib/storage/exif";

// sharp.withExif requires STRING values (not arrays) for IFD tags.
// GPS values must be 3 rational numbers in the form "num/den" for
// degrees/minutes/seconds.
async function makeImageWithGps(latDegrees: number, lngDegrees: number): Promise<Buffer> {
  const latRef = latDegrees >= 0 ? "N" : "S";
  const lngRef = lngDegrees >= 0 ? "E" : "W";
  const latAbs = Math.abs(Math.trunc(latDegrees));
  const lngAbs = Math.abs(Math.trunc(lngDegrees));
  return await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 100, b: 100 } },
  })
    .jpeg()
    .withExif({
      IFD0: {
        DateTimeOriginal: "2024:09:15 12:34:56",
      },
      IFD3: {
        // GPSLatitude as 3 rationals (degrees, minutes, seconds).
        GPSLatitude: `${latAbs}/1 0/1 0/1`,
        GPSLatitudeRef: latRef,
        GPSLongitude: `${lngAbs}/1 0/1 0/1`,
        GPSLongitudeRef: lngRef,
      },
    })
    .toBuffer();
}

async function makeImageNoExif(): Promise<Buffer> {
  return await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 50, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

describe("readExif", () => {
  it("reads GPS coordinates from an image with EXIF GPS", async () => {
    const buf = await makeImageWithGps(35, -82);
    const exif = await readExif(new Uint8Array(buf));
    // EXIF GPS precision is one degree here (we used [35,0,0]). The
    // actual reader rounds to the fractional degree from minutes/
    // seconds; allow a small tolerance.
    expect(exif.latitude).not.toBeNull();
    expect(exif.longitude).not.toBeNull();
    expect(Math.round(exif.latitude!)).toBe(35);
    expect(Math.round(exif.longitude!)).toBe(-82);
  });

  it("returns null GPS for an image without EXIF", async () => {
    const buf = await makeImageNoExif();
    const exif = await readExif(new Uint8Array(buf));
    expect(exif.latitude).toBeNull();
    expect(exif.longitude).toBeNull();
  });

  it("returns null capturedAt for an image without a DateTimeOriginal tag", async () => {
    const buf = await makeImageNoExif();
    const exif = await readExif(new Uint8Array(buf));
    expect(exif.capturedAt).toBeNull();
  });

  it("never throws — returns nulls on a non-image buffer", async () => {
    const notAnImage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const exif = await readExif(notAnImage);
    expect(exif.latitude).toBeNull();
    expect(exif.longitude).toBeNull();
    expect(exif.capturedAt).toBeNull();
  });

  it("never throws — returns nulls on an empty buffer", async () => {
    const empty = new Uint8Array(0);
    const exif = await readExif(empty);
    expect(exif.latitude).toBeNull();
    expect(exif.longitude).toBeNull();
    expect(exif.capturedAt).toBeNull();
  });

  it("handles a south+east GPS (negative lat, positive lng)", async () => {
    const buf = await makeImageWithGps(-33, 151); // Sydney-ish
    const exif = await readExif(new Uint8Array(buf));
    expect(exif.latitude).not.toBeNull();
    expect(exif.longitude).not.toBeNull();
    expect(exif.latitude!).toBeLessThan(0);
    expect(exif.longitude!).toBeGreaterThan(0);
  });
});
