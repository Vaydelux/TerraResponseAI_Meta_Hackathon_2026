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
  it("routes an unlocated critical picture for high priority manual review", () => {
    expect(decideTriage(base, false)).toMatchObject({ triageClass: "high_review", priority: "high" });
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
