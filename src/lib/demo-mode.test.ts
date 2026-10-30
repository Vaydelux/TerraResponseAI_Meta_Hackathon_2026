// src/lib/demo-mode.test.ts
//
// Tests for the demo-mode logic. Pure-function tests for the
// isDemoMode() + isDemoMockModelId() helpers. The DEMO_MODE env var
// is server-only; these tests verify the server-side read.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isDemoMode,
  isDemoMockModelId,
  DEMO_MOCK_MODEL_ID,
} from "@/lib/demo-mode";

describe("isDemoMode", () => {
  const orig = process.env.DEMO_MODE;
  beforeEach(() => { delete process.env.DEMO_MODE; });
  afterEach(() => {
    if (orig === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = orig;
  });

  it("returns false when DEMO_MODE is not set", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("returns true when DEMO_MODE=1", () => {
    process.env.DEMO_MODE = "1";
    expect(isDemoMode()).toBe(true);
  });

  it("returns false when DEMO_MODE is set to anything else (0, true, yes, etc.)", () => {
    process.env.DEMO_MODE = "0";
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = "true";
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = "yes";
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = "";
    expect(isDemoMode()).toBe(false);
  });
});

describe("isDemoMockModelId", () => {
  it("returns true for 'demo-mock-v1'", () => {
    expect(isDemoMockModelId("demo-mock-v1")).toBe(true);
  });

  it("returns false for 'muse-spark-1.3' (the live Meta model)", () => {
    expect(isDemoMockModelId("muse-spark-1.3")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isDemoMockModelId(null)).toBe(false);
    expect(isDemoMockModelId(undefined)).toBe(false);
    expect(isDemoMockModelId("")).toBe(false);
  });

  it("DEMO_MOCK_MODEL_ID constant is 'demo-mock-v1'", () => {
    expect(DEMO_MOCK_MODEL_ID).toBe("demo-mock-v1");
  });
});
