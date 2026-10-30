// src/lib/ai/retry.ts
//
// Bounded exponential-backoff retry for transient Meta API failures
// (429 + 5xx). Per the brief:
//   "capped retries with backoff for transient 429/5xx"
//
// The retry policy:
//   attempt 0: immediate
//   attempt 1: 2s delay
//   attempt 2: 4s delay
//   attempt 3: 8s delay
//   attempt 4: 16s delay
//   max attempts: 5 (total max delay before giving up: ~30s)
//
// On exhaustion: return the last error. The caller transitions the
// report to needs_manual_review.

export const MAX_RETRIES = 4; // 5 total attempts (0 + 4 retries)
export const BASE_DELAY_MS = 2000;
export const MAX_DELAY_MS = 16_000;

/** Compute the delay for a given attempt (0-indexed). Exponential
 *  with a cap. */
export function backoffDelay(attempt: number): number {
  const raw = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(raw, MAX_DELAY_MS);
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Default sleep — overridable for tests. */
async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async operation with bounded exponential backoff.
 *
 * `shouldRetry(result)` returns true for transient failures (the
 * caller classifies the result). If `shouldRetry` returns false, the
 * result is returned immediately (no retry).
 *
 * On exhaustion, the last result is returned.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  config: RetryConfig = {
    maxRetries: MAX_RETRIES,
    baseDelayMs: BASE_DELAY_MS,
    maxDelayMs: MAX_DELAY_MS,
    sleep: defaultSleep,
  },
): Promise<T> {
  let lastResult: T | undefined;
  const sleep = config.sleep ?? defaultSleep;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    lastResult = await fn();

    if (!shouldRetry(lastResult)) {
      return lastResult;
    }

    // Don't sleep after the last attempt.
    if (attempt < config.maxRetries) {
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  return lastResult as T;
}
