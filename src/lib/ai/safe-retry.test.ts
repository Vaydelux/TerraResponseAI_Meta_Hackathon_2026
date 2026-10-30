// src/lib/ai/safe-retry.test.ts
//
// Pure-function tests for the safe-retry decision logic.

import { describe, it, expect } from "vitest";
import {
  decideManualRetry,
  decideForceManualReview,
  MAX_MANUAL_RETRIES,
  RETRYABLE_STATES,
  FORCE_MANUAL_REVIEW_STATES,
} from "@/lib/ai/safe-retry";

describe("safe-retry: decideManualRetry", () => {
  it("allows retry from uploaded", () => {
    const d = decideManualRetry({ status: "uploaded", retryCount: 0 });
    expect(d.allowed).toBe(true);
    expect(d.parkAsManualReview).toBe(false);
    expect(d.nextRetryCount).toBe(1);
  });

  it("allows retry from retryable_error", () => {
    const d = decideManualRetry({ status: "retryable_error", retryCount: 2 });
    expect(d.allowed).toBe(true);
    expect(d.parkAsManualReview).toBe(false);
    expect(d.nextRetryCount).toBe(3);
  });

  it("blocks retry from analyzing (another request is in progress)", () => {
    const d = decideManualRetry({ status: "analyzing", retryCount: 0 });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(false);
    expect(d.reason).toContain("analyzing");
  });

  it("blocks retry from needs_review (already analyzed; would waste cost)", () => {
    const d = decideManualRetry({ status: "needs_review", retryCount: 0 });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(false);
  });

  it("blocks retry from needs_manual_review (reviewer decided to do it by hand)", () => {
    const d = decideManualRetry({ status: "needs_manual_review", retryCount: 0 });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(false);
  });

  it("blocks retry from reviewed (review complete; no re-analysis)", () => {
    const d = decideManualRetry({ status: "reviewed", retryCount: 0 });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(false);
  });

  it("parks as manual review when retry_count is at the cap", () => {
    const d = decideManualRetry({ status: "retryable_error", retryCount: MAX_MANUAL_RETRIES });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(true);
    expect(d.reason).toContain("AI retry exhausted");
    expect(d.reason).toContain(`${MAX_MANUAL_RETRIES} attempts`);
  });

  it("parks as manual review when retry_count exceeds the cap", () => {
    const d = decideManualRetry({ status: "retryable_error", retryCount: MAX_MANUAL_RETRIES + 5 });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(true);
  });

  it("respects a custom max-retries config", () => {
    const d = decideManualRetry({
      status: "retryable_error",
      retryCount: 3,
      config: { maxRetries: 3 },
    });
    expect(d.allowed).toBe(false);
    expect(d.parkAsManualReview).toBe(true);
  });

  it("RETRYABLE_STATES contains uploaded + retryable_error only", () => {
    // Cast to Set<string> so TS doesn't narrow the literal union
    // (which would prevent testing negative cases like .has("analyzing")).
    const states = RETRYABLE_STATES as Set<string>;
    expect(states.has("uploaded")).toBe(true);
    expect(states.has("retryable_error")).toBe(true);
    expect(states.has("analyzing")).toBe(false);
    expect(states.has("needs_review")).toBe(false);
    expect(states.has("needs_manual_review")).toBe(false);
    expect(states.has("reviewed")).toBe(false);
  });
});

describe("safe-retry: decideForceManualReview", () => {
  it("allows force-manual-review from analyzing (the call is stuck)", () => {
    const d = decideForceManualReview("analyzing");
    expect(d.allowed).toBe(true);
  });

  it("allows force-manual-review from retryable_error (the backoff isn't recovering)", () => {
    const d = decideForceManualReview("retryable_error");
    expect(d.allowed).toBe(true);
  });

  it("allows force-manual-review from needs_review (a reviewer can downgrade)", () => {
    const d = decideForceManualReview("needs_review");
    expect(d.allowed).toBe(true);
  });

  it("blocks force-manual-review from uploaded (the report hasn't been analyzed yet)", () => {
    const d = decideForceManualReview("uploaded");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("uploaded");
  });

  it("blocks force-manual-review from needs_manual_review (already in manual review)", () => {
    const d = decideForceManualReview("needs_manual_review");
    expect(d.allowed).toBe(false);
  });

  it("blocks force-manual-review from reviewed (the review is complete)", () => {
    const d = decideForceManualReview("reviewed");
    expect(d.allowed).toBe(false);
  });

  it("FORCE_MANUAL_REVIEW_STATES contains analyzing + retryable_error + needs_review", () => {
    const states = FORCE_MANUAL_REVIEW_STATES as Set<string>;
    expect(states.has("analyzing")).toBe(true);
    expect(states.has("retryable_error")).toBe(true);
    expect(states.has("needs_review")).toBe(true);
    expect(states.has("uploaded")).toBe(false);
    expect(states.has("needs_manual_review")).toBe(false);
    expect(states.has("reviewed")).toBe(false);
  });
});
