import { describe, expect, it } from "vitest";
import { interpretAnalysisResponse } from "./analysis-client-state";

describe("post-upload AI processing outcomes", () => {
  it("does not call an upload an analysis success before inference completes", () => {
    expect(interpretAnalysisResponse(200, { ok: true }).kind).toBe("review_ready");
    expect(interpretAnalysisResponse(500, { ok: false }).kind).toBe("unavailable");
    expect(interpretAnalysisResponse(503, { error: { code: "NOT_CONFIGURED" } }).kind).toBe("unavailable");
  });

  it("handles concurrent requests without suggesting duplicate inference", () => {
    for (const code of ["IN_PROGRESS", "STATE_TRANSITION_FAILED"]) {
      expect(interpretAnalysisResponse(409, { error: { code } }).kind).toBe("processing");
    }
  });

  it("preserves the manual human-review path on schema or model failure", () => {
    for (const code of ["MANUAL_REVIEW", "SCHEMA_INVALID", "RETRY_CAP_REACHED", "PERMANENT_ERROR", "NO_DERIVATIVE"]) {
      expect(interpretAnalysisResponse(422, { error: { code } }).kind).toBe("manual_review");
    }
  });

  it("does not trust a failed HTTP status even with a misleading ok field", () => {
    expect(interpretAnalysisResponse(503, { ok: true }).kind).toBe("unavailable");
    expect(interpretAnalysisResponse(201, { ok: false }).kind).toBe("unavailable");
    expect(interpretAnalysisResponse(200, null).kind).toBe("unavailable");
  });

  it("never presents unverified model output as confirmed evidence", () => {
    const result = interpretAnalysisResponse(200, { ok: true });
    expect(result.message).toMatch(/provisional.*human/i);
  });
});
