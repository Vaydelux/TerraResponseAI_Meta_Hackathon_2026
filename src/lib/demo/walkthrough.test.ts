import { describe, expect, it } from "vitest";
import { INITIAL_DEMO, demoReducer } from "./walkthrough";

describe("isolated sample walkthrough", () => {
  it("prevents skipped review steps and invalid or duplicate decisions", () => {
    const decision = { action: "confirm" as const, note: "Visible water; depth and safety unknown." };
    expect(demoReducer(INITIAL_DEMO, { type: "decide", decision })).toBe(INITIAL_DEMO);
    const observation = demoReducer(INITIAL_DEMO, { type: "submit" });
    expect(demoReducer(observation, { type: "scenario", scenario: "ai-unavailable" })).toBe(observation);
    const review = demoReducer(observation, { type: "review" });
    for (const note of ["", "           ", "too short", "x".repeat(401)]) {
      expect(demoReducer(review, { type: "decide", decision: { ...decision, note } })).toBe(review);
    }
    const result = demoReducer(review, { type: "decide", decision });
    expect(result.stage).toBe("map");
    expect(result.decision).toEqual(decision);
    expect(demoReducer(result, { type: "decide", decision: { action: "reject", note: decision.note } })).toBe(result);
    expect(demoReducer(result, { type: "reset" })).toEqual(INITIAL_DEMO);
    expect(INITIAL_DEMO.decision).toBeNull();
  });
});
