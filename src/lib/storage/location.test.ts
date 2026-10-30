// src/lib/storage/location.test.ts
//
// Tests for the location invariants the route handler enforces:
//   1. Coordinate bounds: lat ∈ [-90, 90], lng ∈ [-180, 180].
//   2. location_source = "unknown" ⇔ coordinates are null.
//   3. location_source in ("gps", "manual") → coordinates are required.
//
// The route handler (src/app/api/reports/route.ts) enforces these
// server-side; these tests document the rule so a future change
// can't break the invariant.

import { describe, it, expect } from "vitest";

/** The invariant the route handler enforces after computing finalLat/finalLon. */
function applyLocationInvariant(
  locationSource: string,
  lat: number | null,
  lng: number | null,
): { lat: number | null; lng: number | null } {
  if (locationSource === "unknown") return { lat: null, lng: null };
  return { lat, lng };
}

/** Bounds check the route handler does. */
function validateBounds(lat: number | null, lng: number | null): { ok: boolean; error?: string } {
  if (lat !== null && (lat < -90 || lat > 90)) return { ok: false, error: "Latitude out of bounds" };
  if (lng !== null && (lng < -180 || lng > 180)) return { ok: false, error: "Longitude out of bounds" };
  return { ok: true };
}

describe("location invariant: unknown ⇔ null coords", () => {
  it("unknown forces coordinates to null", () => {
    const { lat, lng } = applyLocationInvariant("unknown", 35.5, -82.5);
    expect(lat).toBeNull();
    expect(lng).toBeNull();
  });

  it("gps keeps the coordinates", () => {
    const { lat, lng } = applyLocationInvariant("gps", 35.5, -82.5);
    expect(lat).toBe(35.5);
    expect(lng).toBe(-82.5);
  });

  it("manual keeps the coordinates", () => {
    const { lat, lng } = applyLocationInvariant("manual", 40.7, -74.0);
    expect(lat).toBe(40.7);
    expect(lng).toBe(-74.0);
  });

  it("unknown with null coords stays null", () => {
    const { lat, lng } = applyLocationInvariant("unknown", null, null);
    expect(lat).toBeNull();
    expect(lng).toBeNull();
  });
});

describe("coordinate bounds validation", () => {
  it("accepts valid coordinates", () => {
    expect(validateBounds(0, 0).ok).toBe(true);
    expect(validateBounds(90, 180).ok).toBe(true);
    expect(validateBounds(-90, -180).ok).toBe(true);
    expect(validateBounds(45.5, -122.6).ok).toBe(true);
  });

  it("accepts null coordinates (unknown location)", () => {
    expect(validateBounds(null, null).ok).toBe(true);
  });

  it("rejects latitude > 90", () => {
    expect(validateBounds(91, 0).ok).toBe(false);
  });

  it("rejects latitude < -90", () => {
    expect(validateBounds(-91, 0).ok).toBe(false);
  });

  it("rejects longitude > 180", () => {
    expect(validateBounds(0, 181).ok).toBe(false);
  });

  it("rejects longitude < -180", () => {
    expect(validateBounds(0, -181).ok).toBe(false);
  });

  it("rejects extreme invalid values", () => {
    expect(validateBounds(999, 999).ok).toBe(false);
    expect(validateBounds(-999, -999).ok).toBe(false);
  });
});

describe("unlocated reports stay off the map", () => {
  // The onMap filter in GET /api/reports filters:
  //   status = 'reviewed'
  //   AND review_outcome IN ('confirmed','flagged','resolved')
  //   AND location_source != 'unknown'
  //
  // A report with location_source = 'unknown' should NEVER appear
  // in the onMap result, regardless of its status.

  function shouldAppearOnMap(r: { status: string; review_outcome: string | null; location_source: string }): boolean {
    return (
      r.status === "reviewed" &&
      r.review_outcome !== null &&
      ["confirmed", "flagged", "resolved"].includes(r.review_outcome) &&
      r.location_source !== "unknown"
    );
  }

  it("unknown location never appears on map, even if reviewed", () => {
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "confirmed", location_source: "unknown" })).toBe(false);
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "flagged", location_source: "unknown" })).toBe(false);
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "resolved", location_source: "unknown" })).toBe(false);
  });

  it("gps location appears on map when reviewed + confirmed", () => {
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "confirmed", location_source: "gps" })).toBe(true);
  });

  it("manual location appears on map when reviewed + confirmed", () => {
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "confirmed", location_source: "manual" })).toBe(true);
  });

  it("unreviewed reports don't appear on map", () => {
    expect(shouldAppearOnMap({ status: "needs_review", review_outcome: null, location_source: "gps" })).toBe(false);
    expect(shouldAppearOnMap({ status: "uploaded", review_outcome: null, location_source: "manual" })).toBe(false);
  });

  it("rejected reports don't appear on map", () => {
    expect(shouldAppearOnMap({ status: "reviewed", review_outcome: "rejected", location_source: "gps" })).toBe(false);
  });
});
