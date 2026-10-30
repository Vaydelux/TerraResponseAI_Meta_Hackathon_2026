// src/lib/ai/retry.test.ts
//
// Unit tests for the bounded exponential-backoff retry logic.

import { describe, it, expect, vi } from "vitest";
import { withRetry, backoffDelay, MAX_RETRIES, BASE_DELAY_MS, MAX_DELAY_MS } from "@/lib/ai/retry";

describe("backoffDelay", () => {
  it("returns the base delay for attempt 0", () => {
    expect(backoffDelay(0)).toBe(BASE_DELAY_MS);
  });

  it("doubles for each subsequent attempt", () => {
    expect(backoffDelay(0)).toBe(2000);
    expect(backoffDelay(1)).toBe(4000);
    expect(backoffDelay(2)).toBe(8000);
    expect(backoffDelay(3)).toBe(16000);
  });

  it("caps at MAX_DELAY_MS", () => {
    expect(backoffDelay(4)).toBe(MAX_DELAY_MS);
    expect(backoffDelay(100)).toBe(MAX_DELAY_MS);
  });
});

describe("withRetry", () => {
  it("returns immediately on success (no retry)", async () => {
    const fn = vi.fn(async () => "ok");
    const shouldRetry = vi.fn(() => false);
    const sleep = vi.fn(async () => {});
    const result = await withRetry(fn, shouldRetry, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on transient failure, then succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      return attempts < 3 ? { ok: false, kind: "transient" } : { ok: true, data: "success" };
    });
    const shouldRetry = (r: any) => r.ok === false && r.kind === "transient";
    const sleep = vi.fn(async () => {});
    const result = await withRetry(fn, shouldRetry, { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 10, sleep });
    expect(result).toEqual({ ok: true, data: "success" });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // slept before attempts 2 and 3
  });

  it("gives up after maxRetries", async () => {
    const fn = vi.fn(async () => ({ ok: false, kind: "transient" }));
    const shouldRetry = (r: any) => r.ok === false;
    const sleep = vi.fn(async () => {});
    const result = await withRetry(fn, shouldRetry, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, sleep });
    expect(result).toEqual({ ok: false, kind: "transient" });
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => ({ ok: false, kind: "permanent" }));
    const shouldRetry = (r: any) => r.ok === false && r.kind === "transient"; // only transient
    const sleep = vi.fn(async () => {});
    const result = await withRetry(fn, shouldRetry, { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 10, sleep });
    expect(result).toEqual({ ok: false, kind: "permanent" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not sleep after the last attempt", async () => {
    const fn = vi.fn(async () => ({ ok: false, kind: "transient" }));
    const shouldRetry = (r: any) => r.ok === false;
    const sleep = vi.fn(async () => {});
    await withRetry(fn, shouldRetry, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10, sleep });
    // 3 total attempts (1 initial + 2 retries), 2 sleeps (before retry 1 + 2)
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
