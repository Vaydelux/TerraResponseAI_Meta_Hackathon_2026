import { describe, expect, it } from "vitest";
import { scaledDimensions } from "./prepare-image";

describe("client image preparation", () => {
  it("keeps small images within their original dimensions", () => {
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge to the bounded ingestion size", () => {
    expect(scaledDimensions(4000, 2000)).toEqual({ width: 1200, height: 600 });
    expect(scaledDimensions(2000, 4000)).toEqual({ width: 600, height: 1200 });
  });

  it("rejects invalid dimensions instead of creating an invalid canvas", () => {
    expect(() => scaledDimensions(0, 100)).toThrow();
  });
});
