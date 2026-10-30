// src/lib/storage/missing-location.test.ts
//
// Pure-function tests for the missing-location resolver + bounds
// validator.

import { describe, it, expect } from "vitest";
import {
  resolveLocation,
  validateBounds,
  type LocationInput,
} from "@/lib/storage/missing-location";

describe("missing-location: resolveLocation", () => {
  it("honors user-chosen 'unknown' even when EXIF coords are present", () => {
    const r = resolveLocation({
      userSource: "unknown",
      userLat: null,
      userLng: null,
      exifLat: 35.5,
      exifLng: -82.5,
    });
    expect(r.source).toBe("unknown");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.fromExif).toBe(false);
  });

  it("uses the user's manual pin when present (overrides EXIF)", () => {
    const r = resolveLocation({
      userSource: "manual",
      userLat: 35.5,
      userLng: -82.5,
      exifLat: 40.0,
      exifLng: -74.0,
    });
    expect(r.source).toBe("manual");
    expect(r.latitude).toBe(35.5);
    expect(r.longitude).toBe(-82.5);
    expect(r.fromExif).toBe(false);
  });

  it("uses EXIF GPS when the user said 'gps' and EXIF is present", () => {
    const r = resolveLocation({
      userSource: "gps",
      userLat: null,
      userLng: null,
      exifLat: 35.5,
      exifLng: -82.5,
    });
    expect(r.source).toBe("gps");
    expect(r.latitude).toBe(35.5);
    expect(r.longitude).toBe(-82.5);
    expect(r.fromExif).toBe(true);
  });

  it("downgrades to 'unknown' when the user said 'gps' but EXIF is missing", () => {
    const r = resolveLocation({
      userSource: "gps",
      userLat: null,
      userLng: null,
      exifLat: null,
      exifLng: null,
    });
    expect(r.source).toBe("unknown");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.provenance).toContain("no EXIF GPS");
  });

  it("defaults to EXIF when userSource is null and EXIF is present", () => {
    const r = resolveLocation({
      userSource: null,
      userLat: null,
      userLng: null,
      exifLat: 35.5,
      exifLng: -82.5,
    });
    expect(r.source).toBe("gps");
    expect(r.fromExif).toBe(true);
  });

  it("returns unknown when both EXIF + user pin are missing", () => {
    const r = resolveLocation({
      userSource: null,
      userLat: null,
      userLng: null,
      exifLat: null,
      exifLng: null,
    });
    expect(r.source).toBe("unknown");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.provenance).toContain("Unlocated");
  });

  it("returns unknown when userSource is manual but coords are missing", () => {
    const r = resolveLocation({
      userSource: "manual",
      userLat: null,
      userLng: null,
      exifLat: null,
      exifLng: null,
    });
    expect(r.source).toBe("unknown");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
  });

  it("always sets provenance with a human-readable explanation", () => {
    const cases: LocationInput[] = [
      { userSource: "unknown", userLat: null, userLng: null, exifLat: null, exifLng: null },
      { userSource: "manual", userLat: 1, userLng: 2, exifLat: null, exifLng: null },
      { userSource: "gps", userLat: null, userLng: null, exifLat: 3, exifLng: 4 },
      { userSource: null, userLat: null, userLng: null, exifLat: null, exifLng: null },
    ];
    for (const c of cases) {
      const r = resolveLocation(c);
      expect(r.provenance.length).toBeGreaterThan(5);
      expect(typeof r.provenance).toBe("string");
    }
  });
});

describe("missing-location: validateBounds", () => {
  it("returns null for valid coords", () => {
    expect(validateBounds(35.5, -82.5)).toBeNull();
    expect(validateBounds(-90, -180)).toBeNull();
    expect(validateBounds(90, 180)).toBeNull();
  });

  it("returns null for null coords (unknown location)", () => {
    expect(validateBounds(null, null)).toBeNull();
  });

  it("rejects latitude > 90", () => {
    expect(validateBounds(91, 0)).toContain("Latitude");
  });

  it("rejects latitude < -90", () => {
    expect(validateBounds(-91, 0)).toContain("Latitude");
  });

  it("rejects longitude > 180", () => {
    expect(validateBounds(0, 181)).toContain("Longitude");
  });

  it("rejects longitude < -180", () => {
    expect(validateBounds(0, -181)).toContain("Longitude");
  });

  it("rejects NaN coords (defense-in-depth)", () => {
    expect(validateBounds(Number.NaN, 0)).toContain("Latitude");
  });
});
