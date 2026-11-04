import { describe, expect, it } from "vitest";
import { getReviewCapabilities } from "./capabilities";

const base = { globalRole: "reviewer", eventRole: "reviewer" as const,
  actorId: "reviewer-a", creatorId: "reporter-b",
  status: "needs_manual_review", retentionState: "active" };

describe("role and event scoped reviewer capabilities", () => {
  it("allows independent assigned reviewers to review/segment manual evidence, not override", () => {
    expect(getReviewCapabilities(base)).toMatchObject({
      canReview: true, canSegment: true, canOverridePriority: false, reason: null,
    });
  });
  it("separates moderator/reviewer permission from coordinator priority override", () => {
    expect(getReviewCapabilities({ ...base, eventRole: "coordinator" })).toMatchObject({
      canReview: true, canOverridePriority: true,
    });
  });
  it("does not expose write actions to unrelated event reviewers", () => {
    expect(getReviewCapabilities({ ...base, eventRole: null })).toMatchObject({
      canReview: false, canOverridePriority: false, canSegment: false,
    });
  });
  it("enforces contributor self-review ban except for admins", () => {
    expect(getReviewCapabilities({ ...base, creatorId: "reviewer-a" }).canReview).toBe(false);
    expect(getReviewCapabilities({ ...base, creatorId: "reviewer-a", globalRole: "admin" }).canReview).toBe(true);
  });
  it("does not let reporters act as reviewer even with unrelated membership", () => {
    expect(getReviewCapabilities({ ...base, globalRole: "reporter" }).canReview).toBe(false);
  });
  it("fails closed for deleted or processing reports", () => {
    expect(getReviewCapabilities({ ...base, retentionState: "purged" }).canReview).toBe(false);
    expect(getReviewCapabilities({ ...base, status: "analyzing" }).canSegment).toBe(false);
  });
});
