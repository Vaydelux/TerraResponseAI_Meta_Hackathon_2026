import { describe, expect, it } from "vitest";
import { formatLocationPoint, parseCoordinateQuery, validPoint } from "./location-search";
describe("location search never invents coordinates", () => {
  it("parses real WGS84 latitude and longitude in both hemispheres", () => {
    expect(parseCoordinateQuery("14.5995, 120.9842")).toEqual({ lat: 14.5995, lon: 120.9842 });
    expect(parseCoordinateQuery("-33.865; 151.209")).toEqual({ lat: -33.865, lon: 151.209 });
    expect(parseCoordinateQuery("0, 0")).toEqual({ lat: 0, lon: 0 });
    expect(formatLocationPoint({ lat: 14.5995, lon: 120.9842 })).toBe("14.59950, 120.98420");
  });
  it("rejects invalid or fictitious coordinates", () => {
    for (const s of ["Manila", "Pasig Bridge", "100, 121", "14, 190", "14, 121, 122", "abc, 123", "", "Infinity, 10"]) {
      expect(parseCoordinateQuery(s)).toBeNull();
    }
    expect(validPoint(Number.NaN, 121)).toBe(false);
  });
});
