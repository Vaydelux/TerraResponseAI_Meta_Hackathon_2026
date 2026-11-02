import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readPersistedTriage } from "./persisted-snapshot";

const persisted = {
  incident_type: "flooding",
  triage_class: "critical_provisional",
  verification_status: "awaiting_human",
  publication_status: "private",
  reason_code: "CRITICAL_POSSIBLE_DISASTER",
  triage_policy_version: "report-first-v1",
};

describe("persisted triage is authoritative on retries", () => {
  it("recovers the original critical priority without changing its private publication status", () => {
    expect(readPersistedTriage(persisted)).toMatchObject({
      incidentType: "flooding", triageClass: "critical_provisional",
      priority: "critical", publicationStatus: "private", notifyAdmin: true,
    });
  });
  it("preserves human verification and publication even when triage is retried", () => {
    const reviewed = readPersistedTriage({
      ...persisted, verification_status: "confirmed", publication_status: "public_verified",
    });
    expect(reviewed.verificationStatus).toBe("confirmed");
    expect(reviewed.publicationStatus).toBe("public_verified");
  });
  it("routes low priority records to moderation rather than urgent notifications", () => {
    expect(readPersistedTriage({ ...persisted, triage_class: "moderate_review" })).toMatchObject({
      priority: "normal", notifyAdmin: false,
    });
    expect(readPersistedTriage({ ...persisted, triage_class: "high_review" })).toMatchObject({
      priority: "high", notifyAdmin: true,
    });
  });
  it("fails closed on invalid stored states", () => {
    expect(() => readPersistedTriage(null)).toThrow();
    expect(() => readPersistedTriage({ ...persisted, triage_class: "confirmed_disaster" })).toThrow();
    expect(() => readPersistedTriage({ ...persisted, publication_status: "public_automatic" })).toThrow();
  });
  it("never reclassifies or overwrites a committed record during a retry", () => {
    const source = readFileSync("src/lib/triage/processing.ts", "utf8");
    expect(source).toContain('onConflict: "report_id", ignoreDuplicates: true');
    expect(source).toContain("readPersistedTriage(persisted)");
    expect(source).toContain("stored.incidentType");
    expect(source).toContain('stored.verificationStatus === "awaiting_human"');
    expect(source).not.toContain("return { ...decision, policyVersion: TRIAGE_POLICY_VERSION }");
  });
});
