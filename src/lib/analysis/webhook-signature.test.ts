import { describe, expect, it, beforeEach } from "vitest";
import { signAnalysisWebhook, verifyAnalysisWebhook } from "./webhook-signature";

describe("analysis webhook signatures", () => {
  beforeEach(() => {
    process.env.ANALYSIS_WEBHOOK_SECRET = "a-test-analysis-secret-that-is-long-enough";
  });

  it("accepts a fresh signature bound to report and actor", () => {
    const signature = signAnalysisWebhook({
      reportId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      timestampSeconds: 1_700_000_000,
    });

    expect(verifyAnalysisWebhook({
      signature,
      reportId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      nowSeconds: 1_700_000_120,
    })).toBe(true);
  });

  it("rejects replayed, tampered, and differently bound signatures", () => {
    const signature = signAnalysisWebhook({
      reportId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      timestampSeconds: 1_700_000_000,
    });

    expect(verifyAnalysisWebhook({ signature, reportId: "11111111-1111-4111-8111-111111111111", actorId: "22222222-2222-4222-8222-222222222222", nowSeconds: 1_700_000_301 })).toBe(false);
    expect(verifyAnalysisWebhook({ signature: `${signature}x`, reportId: "11111111-1111-4111-8111-111111111111", actorId: "22222222-2222-4222-8222-222222222222", nowSeconds: 1_700_000_001 })).toBe(false);
    expect(verifyAnalysisWebhook({ signature, reportId: "33333333-3333-4333-8333-333333333333", actorId: "22222222-2222-4222-8222-222222222222", nowSeconds: 1_700_000_001 })).toBe(false);
  });
});
