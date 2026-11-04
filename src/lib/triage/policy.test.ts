import { describe, expect, it } from "vitest";
import { decideTriage, TRIAGE_POLICY_VERSION } from "./policy";
import type { Observation } from "@/lib/ai/observation-schema";

const base: Observation = {
  incident_type: "flooding",
  visible_evidence: ["Visible flooded roadway", "Water at doors of several structures"],
  preliminary_severity: 5,
  uncertainties: ["Depth cannot be confirmed"],
  summary_en: "Potential flood event",
  summary_tl: "Posibleng pagbaha",
  needs_review: true,
  segmentation_target: null,
  primary_category: "Flooding",
  confidence_score: 0.96,
  confidence_reasoning: "Floodwater is visibly covering the roadway.",
  human_triage_required: false,
  anomalies_detected: [],
};

describe("report-first safety policy", () => {
  it("never auto-confirms a critical event or publishes evidence publicly", () => {
    const d = decideTriage(base, true);
    expect(TRIAGE_POLICY_VERSION).toBe("report-first-v1");
    expect(d).toMatchObject({
      triageClass: "critical_provisional",
      verificationStatus: "awaiting_human",
      publicationStatus: "private",
      notifyAdmin: true,
      priority: "critical",
    });
  });
  it("permits only explicit, evidence-backed critical provisional publication", () => {
    const released = decideTriage(base, true, true);
    expect(released).toMatchObject({
      triageClass: "critical_provisional",
      verificationStatus: "awaiting_human",
      publicationStatus: "public_provisional",
      notifyAdmin: true,
    });
    expect(decideTriage({ ...base, preliminary_severity: 4 }, true, true).publicationStatus).toBe("private");
    expect(decideTriage(base, false, true).publicationStatus).toBe("private");
    expect(decideTriage({ ...base, visible_evidence: ["flood"] }, true, true).publicationStatus).toBe("private");
    expect(decideTriage({ ...base, incident_type: "unclear" }, true, true).publicationStatus).toBe("private");
  });
  it("routes an unlocated critical picture for high priority manual review", () => {
    expect(decideTriage(base, false)).toMatchObject({ triageClass: "high_review", priority: "high" });
  });
  it("marks only high-confidence, anomaly-free non-disasters as cancellation candidates", () => {
    const candidate = decideTriage({
      ...base,
      incident_type: "other",
      primary_category: "NonDisaster",
      confidence_score: 0.99,
      human_triage_required: false,
      anomalies_detected: [],
    }, true);
    expect(candidate).toMatchObject({
      triageClass: "unrelated_review",
      reasonCode: "HIGH_CONFIDENCE_NONDISASTER_CANCELLATION_CANDIDATE",
      autoCancelCandidate: true,
    });
    expect(decideTriage({ ...base, primary_category: "NonDisaster", confidence_score: 0.99, anomalies_detected: ["metadata mismatch"] }, true).autoCancelCandidate).toBe(false);
  });
  it("does not label insufficient evidence or high uncertainty as confirmed", () => {
    const d=decideTriage({ ...base, visible_evidence: ["water"], uncertainties: ["one", "two", "three"] }, true);
    expect(d.triageClass).toBe("high_review");
    expect(d.verificationStatus).toBe("awaiting_human");
  });
  it("sends level four to escalated review and level three to moderate queue", () => {
    expect(decideTriage({ ...base, preliminary_severity: 4 }, true).triageClass).toBe("high_review");
    expect(decideTriage({ ...base, preliminary_severity: 3 }, true).triageClass).toBe("moderate_review");
  });
  it("routes low/no disaster to moderation", () => {
    expect(decideTriage({ ...base, preliminary_severity: 1 }, true).triageClass).toBe("low_review");
    expect(decideTriage({ ...base, incident_type: "other" }, true).triageClass).toBe("unrelated_review");
    expect(decideTriage({ ...base, incident_type: "unclear", preliminary_severity: null }, true).triageClass).toBe("unrelated_review");
  });
  it("refuses missing and invalid severity", () => {
    expect(decideTriage({ ...base, preliminary_severity: null }, true).triageClass).toBe("uncertain_review");
    expect(decideTriage({ ...base, preliminary_severity: Number.NaN }, true).triageClass).toBe("uncertain_review");
  });
});
