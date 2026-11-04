import { describe, expect, it } from "vitest";
import { classifyHazard, filterWorkspaceReports, getTimeBounds, hasMapLocation, reportTitle, type WorkspaceFilters, type WorkspaceReport } from "./incidents";

function report(overrides: Partial<WorkspaceReport> = {}): WorkspaceReport {
  return { id: "report-a", status: "needs_review", review_outcome: null, title: "Submitted observation",
    uploaded_at: "2026-11-04T00:00:00Z", location_source: "manual", latitude: 14.6, longitude: 121,
    priority_score: null, ...overrides };
}
const all: WorkspaceFilters = { hazard: "all", query: "", cutoff: null, sort: "priority" };

describe("truthful incident identity and hazard", () => {
  it("uses explicit type regardless of misleading title keywords or severity", () => {
    expect(classifyHazard(report({ incident_type: "blocked_road", title: "Fire at a hospital", severity: 5 }))).toBe("road");
    expect(classifyHazard(report({ incident_type: "flooding", severity: 5 }))).toBe("flood");
    expect(classifyHazard(report({ incident_type: null, title: "flood medical fire", severity: 5 }))).toBe("other");
    expect(classifyHazard(report({ incident_type: "future-unrecognized-type" }))).toBe("other");
  });
  it.each([
    ["fire", "hazmat"], ["hazardous_material", "hazmat"], ["medical", "medical"],
    ["visible_structural_damage", "structural"], ["debris", "debris"], ["unclear", "other"],
  ])("maps explicit %s to %s", (incident_type, expected) => {
    expect(classifyHazard(report({ incident_type }))).toBe(expected);
  });
  it("uses a neutral ID fallback rather than a fictional incident title", () => {
    expect(reportTitle(report({ id: "abcdefgh-1234", title: "  " }))).toBe("Report abcdefgh");
    expect(reportTitle(report({ title: "  Actual submitted title  " }))).toBe("Actual submitted title");
  });
});

describe("map location boundary", () => {
  it.each([
    { latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 }, { latitude: 0, longitude: 0 },
  ])("accepts finite geographic bounds including $latitude/$longitude", (coordinates) => {
    expect(hasMapLocation(report(coordinates))).toBe(true);
  });
  it.each([
    { latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { longitude: Infinity },
    { latitude: null }, { longitude: null }, { location_source: "unknown" },
  ])("never plots an unknown or invalid location %j", (invalid) => {
    expect(hasMapLocation(report(invalid))).toBe(false);
  });
});

describe("reported-time snapshot selectors", () => {
  it("preserves actual equal timestamps without inventing a replay window", () => {
    const time = Date.parse("2026-11-04T00:00:00Z");
    expect(getTimeBounds([report(), report({ id: "b" })])).toEqual({ min: time, max: time });
    expect(getTimeBounds([report({ uploaded_at: "invalid" }), report({ uploaded_at: "" })])).toBeNull();
    expect(getTimeBounds([])).toBeNull();
  });
  it("uses only valid upload dates for bounds, excluding missing data", () => {
    const bounds = getTimeBounds([report(), report({ uploaded_at: "invalid" }), report({ uploaded_at: "2026-11-04T02:00:00Z" })]);
    expect(bounds).toEqual({ min: Date.parse("2026-11-04T00:00:00Z"), max: Date.parse("2026-11-04T02:00:00Z") });
  });
  it("combines hazard, search, and inclusive cutoff on the same report set", () => {
    const input = [report({ id: "a", incident_type: "flooding", location_label: "North district" }),
      report({ id: "b", incident_type: "flooding", location_label: "North district", uploaded_at: "2026-11-04T02:00:00Z" }),
      report({ id: "c", incident_type: "blocked_road", location_label: "North district" }),
      report({ id: "d", incident_type: "flooding", location_label: "North district", uploaded_at: "invalid" })];
    expect(filterWorkspaceReports(input, { ...all, hazard: "flood", query: " NORTH ", cutoff: Date.parse(input[0].uploaded_at) }).map((row) => row.id)).toEqual(["a"]);
    expect(filterWorkspaceReports(input, { ...all, hazard: "flood", query: "north" })).toHaveLength(3);
  });
  it("keeps unlocated reports in queue results", () => {
    const input = report({ location_source: "unknown", latitude: null, longitude: null });
    expect(filterWorkspaceReports([input], all)).toEqual([input]);
    expect(hasMapLocation(input)).toBe(false);
  });
  it("uses priority, recency and ID for stable sorting without mutating source data", () => {
    const input = [report({ id: "c", priority_score: null }), report({ id: "b", priority_score: 40 }),
      report({ id: "a", priority_score: 40 }), report({ id: "d", priority_score: 0 })];
    expect(filterWorkspaceReports(input, all).map((row) => row.id)).toEqual(["a", "b", "d", "c"]);
    expect(input.map((row) => row.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("sorts newest first with invalid timestamps last", () => {
    expect(filterWorkspaceReports([report({ id: "invalid", uploaded_at: "invalid" }), report({ id: "old" }),
      report({ id: "new", uploaded_at: "2026-11-04T01:00:00Z" })], { ...all, sort: "newest" }).map((row) => row.id)).toEqual(["new", "old", "invalid"]);
  });
  it("removes deleted/rejected reports and finds unknown hazards without inference", () => {
    const rows = [report({ id: "gone", retention_state: "soft_deleted" }), report({ id: "rejected", review_outcome: "rejected" }),
      report({ id: "other", incident_type: "unclear", summary: "Recorded low visibility" })];
    expect(filterWorkspaceReports(rows, { ...all, hazard: "other", query: "VISIBILITY" }).map((row) => row.id)).toEqual(["other"]);
  });
});
