import { describe, expect, it } from "vitest";
import { reportUpdateSchema, toReportColumns } from "./report-update";

describe("report PATCH location validation", () => {
  it("converts camelCase input to the canonical snake_case columns", () => {
    expect(toReportColumns(reportUpdateSchema.parse({
      title: "Flooded road",
      locationSource: "manual",
      latitude: 14.5995,
      longitude: 120.9842,
      locationLabel: "Near the main bridge",
    }))).toEqual({
      title: "Flooded road",
      location_source: "manual",
      latitude: 14.5995,
      longitude: 120.9842,
      location_label: "Near the main bridge",
    });
  });

  it("clears both coordinates when location becomes unknown", () => {
    expect(toReportColumns(reportUpdateSchema.parse({
      locationSource: "unknown",
    }))).toEqual({
      location_source: "unknown",
      latitude: null,
      longitude: null,
    });
  });

  it("rejects partial GPS/manual positions and conflicting unknown positions", () => {
    expect(() => toReportColumns(reportUpdateSchema.parse({
      locationSource: "gps", latitude: 14.6,
    }))).toThrow("both coordinates");
    expect(() => toReportColumns(reportUpdateSchema.parse({
      latitude: 14.6, longitude: 121,
    }))).toThrow("locationSource");
    expect(() => toReportColumns(reportUpdateSchema.parse({
      locationSource: "unknown", latitude: 14.6, longitude: 121,
    }))).toThrow("must not have coordinates");
  });

  it("allows text-only changes without rewriting location", () => {
    expect(toReportColumns(reportUpdateSchema.parse({
      description: "Flood waters visible.",
    }))).toEqual({ description: "Flood waters visible." });
  });

  it("rejects empty or unauthorized database fields", () => {
    expect(() => toReportColumns(reportUpdateSchema.parse({}))).toThrow("No editable fields");
    expect(() => reportUpdateSchema.parse({ status: "reviewed" })).toThrow();
    expect(() => reportUpdateSchema.parse({ locationSource: "manual", latitude: 100, longitude: 121 })).toThrow();
  });
});
