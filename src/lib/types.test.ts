import { describe, it, expect } from "vitest";
import { severityBand, SEVERITY_BANDS, ROLES, REPORT_STATUSES } from "@/lib/types";

describe("severityBand", () => {
  it("returns Critical for scores >= 75", () => {
    expect(severityBand(100)).toBe("Critical");
    expect(severityBand(90)).toBe("Critical");
    expect(severityBand(75)).toBe("Critical");
  });
  it("returns High for 50 <= score < 75", () => {
    expect(severityBand(74)).toBe("High");
    expect(severityBand(60)).toBe("High");
    expect(severityBand(50)).toBe("High");
  });
  it("returns Medium for 25 <= score < 50", () => {
    expect(severityBand(49)).toBe("Medium");
    expect(severityBand(25)).toBe("Medium");
  });
  it("returns Low for 1 <= score < 25", () => {
    expect(severityBand(24)).toBe("Low");
    expect(severityBand(1)).toBe("Low");
  });
  it("returns Minimal for 0", () => {
    expect(severityBand(0)).toBe("Minimal");
  });
  it("has bands sorted descending by threshold", () => {
    const ts = SEVERITY_BANDS.map((b) => b.threshold);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThan(ts[i]);
    }
  });
});

describe("role + status enums are non-empty and stable", () => {
  it("ROLES contains the three sandbox roles", () => {
    expect(ROLES).toEqual(["REPORTER", "REVIEWER", "ADMIN"]);
  });
  it("REPORT_STATUSES covers the full lifecycle", () => {
    expect(REPORT_STATUSES).toContain("UPLOADED");
    expect(REPORT_STATUSES).toContain("ANALYZED");
    expect(REPORT_STATUSES).toContain("IN_REVIEW");
    expect(REPORT_STATUSES).toContain("CONFIRMED");
    expect(REPORT_STATUSES).toContain("FLAGGED");
    expect(REPORT_STATUSES).toContain("REJECTED");
    expect(REPORT_STATUSES).toContain("RESOLVED");
  });
});
