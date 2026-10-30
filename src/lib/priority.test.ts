// src/lib/priority.test.ts
//
// Vitest tests for the pure TypeScript priority calculation.
// Per the brief: "Add Vitest boundary, missing-value, duplicate-
// corroboration and permission tests."
//
// Test groups:
//   1. Boundary tests (0, 100, each factor's min/max)
//   2. Missing-value tests (null inputs → unassessed, not 0)
//   3. Duplicate-corroboration tests (same SHA-256 doesn't count)
//   4. Severity mapping tests (1→8, 3→24, 5→40, null→unassessed)
//   5. Recency tests (6h→full, 72h→0, no capture→penalty)
//   6. Access disruption (reported vs verified vs denied)
//   7. Facility impact (verified vs unverified vs denied)
//   8. Label is always "provisional review prioritization"

import { describe, it, expect } from "vitest";
import { calculatePriority, type PriorityInput } from "@/lib/priority";

// Helper: build a standard input with overrides.
function makeInput(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    visualSeverity: 3,
    facilityImpactVerified: null,
    accessDisruptionReported: null,
    accessDisruptionVerified: null,
    capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    uploadedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
    eventCreatedAt: null,
    sha256: "a".repeat(64),
    otherDigestsInEvent: [],
    ...overrides,
  };
}

describe("calculatePriority — boundary tests", () => {
  it("scores 0 when all factors are null/zero", () => {
    const result = calculatePriority(
      makeInput({
        visualSeverity: null,
        facilityImpactVerified: null,
        accessDisruptionReported: null,
        accessDisruptionVerified: null,
        capturedAt: new Date(Date.now() - 100 * 60 * 60 * 1000), // 100h ago
        otherDigestsInEvent: [],
      }),
    );
    expect(result.score).toBe(0);
  });

  it("scores 100 when all factors are maxed", () => {
    const result = calculatePriority(
      makeInput({
        visualSeverity: 5, // 40
        facilityImpactVerified: true, // 20
        accessDisruptionReported: true, // 15
        accessDisruptionVerified: true, // verified → 15
        capturedAt: new Date(), // now → 15
        otherDigestsInEvent: ["b".repeat(64), "c".repeat(64)], // 2 distinct → 10
      }),
    );
    expect(result.score).toBe(100);
  });

  it("never exceeds 100", () => {
    const result = calculatePriority(
      makeInput({
        visualSeverity: 5,
        facilityImpactVerified: true,
        accessDisruptionReported: true,
        accessDisruptionVerified: true,
        capturedAt: new Date(),
        otherDigestsInEvent: Array.from({ length: 50 }, (_, i) => `d${i}`.repeat(31)),
      }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("never goes below 0", () => {
    const result = calculatePriority(
      makeInput({
        visualSeverity: null,
        facilityImpactVerified: false,
        accessDisruptionReported: false,
        capturedAt: new Date(Date.now() + 1000), // future → capped at full
        otherDigestsInEvent: [],
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("calculatePriority — severity mapping", () => {
  it("maps severity 1 → 8 points", () => {
    const result = calculatePriority(makeInput({ visualSeverity: 1 }));
    const factor = result.factors.find((f) => f.name === "Visual severity");
    expect(factor?.points).toBe(8);
  });

  it("maps severity 3 → 24 points", () => {
    const result = calculatePriority(makeInput({ visualSeverity: 3 }));
    const factor = result.factors.find((f) => f.name === "Visual severity");
    expect(factor?.points).toBe(24);
  });

  it("maps severity 5 → 40 points", () => {
    const result = calculatePriority(makeInput({ visualSeverity: 5 }));
    const factor = result.factors.find((f) => f.name === "Visual severity");
    expect(factor?.points).toBe(40);
  });

  it("maps null severity → 0 points + unassessed status", () => {
    const result = calculatePriority(makeInput({ visualSeverity: null }));
    const factor = result.factors.find((f) => f.name === "Visual severity");
    expect(factor?.points).toBe(0);
    expect(factor?.status).toBe("unassessed");
    expect(factor?.explanation).toContain("could not determine");
  });
});

describe("calculatePriority — missing-value tests", () => {
  it("facilityImpact null → unassessed, not 0", () => {
    const result = calculatePriority(makeInput({ facilityImpactVerified: null }));
    const factor = result.factors.find((f) => f.name === "Critical facility impact");
    expect(factor?.status).toBe("unassessed");
    expect(factor?.points).toBe(0);
    expect(factor?.explanation).toContain("No verified");
  });

  it("accessDisruption null → unassessed, not 0", () => {
    const result = calculatePriority(
      makeInput({ accessDisruptionReported: null, accessDisruptionVerified: null }),
    );
    const factor = result.factors.find((f) => f.name === "Access disruption");
    expect(factor?.status).toBe("unassessed");
    expect(factor?.points).toBe(0);
  });

  it("records unassessed factors in missingEvidence", () => {
    const result = calculatePriority(
      makeInput({
        visualSeverity: null,
        facilityImpactVerified: null,
        accessDisruptionReported: null,
      }),
    );
    expect(result.missingEvidence.length).toBeGreaterThanOrEqual(3);
    expect(result.missingEvidence.some((e) => e.includes("Visual severity"))).toBe(true);
    expect(result.missingEvidence.some((e) => e.includes("Critical facility impact"))).toBe(true);
    expect(result.missingEvidence.some((e) => e.includes("Access disruption"))).toBe(true);
  });
});

describe("calculatePriority — duplicate-corroboration tests", () => {
  it("same SHA-256 digests do NOT count as independent corroboration", () => {
    const thisDigest = "a".repeat(64);
    const result = calculatePriority(
      makeInput({
        sha256: thisDigest,
        otherDigestsInEvent: [thisDigest, thisDigest, thisDigest], // 3 duplicates of THIS image
      }),
    );
    const factor = result.factors.find((f) => f.name === "Independent corroboration");
    expect(factor?.points).toBe(0);
    expect(factor?.explanation).toContain("No other distinct");
  });

  it("1 distinct image → 5 points", () => {
    const result = calculatePriority(
      makeInput({
        sha256: "a".repeat(64),
        otherDigestsInEvent: ["b".repeat(64)],
      }),
    );
    const factor = result.factors.find((f) => f.name === "Independent corroboration");
    expect(factor?.points).toBe(5);
  });

  it("2+ distinct images → 10 points", () => {
    const result = calculatePriority(
      makeInput({
        sha256: "a".repeat(64),
        otherDigestsInEvent: ["b".repeat(64), "c".repeat(64)],
      }),
    );
    const factor = result.factors.find((f) => f.name === "Independent corroboration");
    expect(factor?.points).toBe(10);
  });

  it("duplicates of OTHER images count once", () => {
    const result = calculatePriority(
      makeInput({
        sha256: "a".repeat(64),
        otherDigestsInEvent: ["b".repeat(64), "b".repeat(64), "b".repeat(64)], // 3 copies of same image
      }),
    );
    const factor = result.factors.find((f) => f.name === "Independent corroboration");
    // 1 unique distinct → 5 points
    expect(factor?.points).toBe(5);
  });
});

describe("calculatePriority — access disruption", () => {
  it("reported but NOT verified → 7 points + unverified status", () => {
    const result = calculatePriority(
      makeInput({
        accessDisruptionReported: true,
        accessDisruptionVerified: null,
      }),
    );
    const factor = result.factors.find((f) => f.name === "Access disruption");
    expect(factor?.points).toBe(7);
    expect(factor?.status).toBe("unverified");
    expect(factor?.explanation).toContain("NOT verified");
  });

  it("reported AND verified → 15 points + assessed", () => {
    const result = calculatePriority(
      makeInput({
        accessDisruptionReported: true,
        accessDisruptionVerified: true,
      }),
    );
    const factor = result.factors.find((f) => f.name === "Access disruption");
    expect(factor?.points).toBe(15);
    expect(factor?.status).toBe("assessed");
  });

  it("explicitly denied → 0 points + assessed", () => {
    const result = calculatePriority(
      makeInput({ accessDisruptionReported: false }),
    );
    const factor = result.factors.find((f) => f.name === "Access disruption");
    expect(factor?.points).toBe(0);
    expect(factor?.status).toBe("assessed");
  });
});

describe("calculatePriority — facility impact", () => {
  it("verified → 20 points", () => {
    const result = calculatePriority(makeInput({ facilityImpactVerified: true }));
    const factor = result.factors.find((f) => f.name === "Critical facility impact");
    expect(factor?.points).toBe(20);
  });

  it("explicitly denied → 0 + assessed", () => {
    const result = calculatePriority(makeInput({ facilityImpactVerified: false }));
    const factor = result.factors.find((f) => f.name === "Critical facility impact");
    expect(factor?.points).toBe(0);
    expect(factor?.status).toBe("assessed");
  });
});

describe("calculatePriority — time recency", () => {
  it("captured within 6h → full 15 points", () => {
    const result = calculatePriority(
      makeInput({ capturedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) }), // 3h ago
    );
    const factor = result.factors.find((f) => f.name === "Time recency");
    expect(factor?.points).toBe(15);
  });

  it("captured 72h+ ago → 0 points", () => {
    const result = calculatePriority(
      makeInput({ capturedAt: new Date(Date.now() - 80 * 60 * 60 * 1000) }), // 80h ago
    );
    const factor = result.factors.find((f) => f.name === "Time recency");
    expect(factor?.points).toBe(0);
  });

  it("no capture timestamp → uses upload time with 70% penalty", () => {
    const result = calculatePriority(
      makeInput({
        capturedAt: null,
        uploadedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago
      }),
    );
    const factor = result.factors.find((f) => f.name === "Time recency");
    // 15 * 0.7 = 10.5 → rounded to 11 (or 10 depending on rounding)
    expect(factor?.points).toBeGreaterThan(0);
    expect(factor?.points).toBeLessThan(15);
    expect(factor?.explanation).toContain("70%");
  });
});

describe("calculatePriority — label", () => {
  it("always labels as 'provisional review prioritization'", () => {
    const result = calculatePriority(makeInput());
    expect(result.label).toBe("provisional review prioritization");
  });
});

describe("calculatePriority — factor breakdown completeness", () => {
  it("returns exactly 5 factors", () => {
    const result = calculatePriority(makeInput());
    expect(result.factors).toHaveLength(5);
  });

  it("each factor has name, maxPoints, points, status, explanation", () => {
    const result = calculatePriority(makeInput());
    for (const f of result.factors) {
      expect(f.name).toBeTruthy();
      expect(f.maxPoints).toBeGreaterThan(0);
      expect(f.points).toBeGreaterThanOrEqual(0);
      expect(f.points).toBeLessThanOrEqual(f.maxPoints);
      expect(["assessed", "unassessed", "unverified"]).toContain(f.status);
      expect(f.explanation.length).toBeGreaterThan(0);
    }
  });

  it("factor maxPoints sum to 100", () => {
    const result = calculatePriority(makeInput());
    const sum = result.factors.reduce((s, f) => s + f.maxPoints, 0);
    expect(sum).toBe(100);
  });
});
