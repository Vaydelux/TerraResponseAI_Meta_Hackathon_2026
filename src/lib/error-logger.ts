// src/lib/error-logger.ts
//
// Structured error logging utility. Provides a consistent format for
// server-side error logging that Vercel and other log aggregators can
// parse. Logs to console.error (Vercel captures it) with a structured
// JSON shape — no secrets, no user data, no image content.
//
// Per the brief: "Log ... failures without logging secrets or
// sensitive image content."

export interface ErrorLogEntry {
  /** The error category (e.g., "api", "auth", "ai", "storage"). */
  context: string;
  /** The error message (sanitized — no secrets). */
  message: string;
  /** Optional: the operation that failed (e.g., "analyze", "upload"). */
  operation?: string;
  /** Optional: the report ID (if the error is report-specific). */
  reportId?: string;
  /** Optional: the event ID (if the error is event-specific). */
  eventId?: string;
  /** Optional: a correlation/trace ID (e.g., from Vercel). */
  traceId?: string;
  /** Optional: the error digest (from Next.js error boundary). */
  digest?: string;
}

/**
 * Log a structured error to the server console. Vercel captures
 * console.error output; other platforms can forward to Datadog, ELK,
 * or Sentry by replacing this function.
 *
 * NEVER log: API keys, passwords, JWT tokens, image bytes, raw model
 * response text, or user PII. Only log the error message + context.
 */
export function logError(entry: ErrorLogEntry): void {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({
    timestamp,
    level: "error",
    context: entry.context,
    message: entry.message,
    ...(entry.operation && { operation: entry.operation }),
    ...(entry.reportId && { reportId: entry.reportId }),
    ...(entry.eventId && { eventId: entry.eventId }),
    ...(entry.traceId && { traceId: entry.traceId }),
    ...(entry.digest && { digest: entry.digest }),
  });
  console.error(logLine);
}

/**
 * Log a warning (non-blocking). Used for rate-limit failures, cache
 * misses, and other recoverable issues.
 */
export function logWarn(entry: ErrorLogEntry): void {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({
    timestamp,
    level: "warn",
    context: entry.context,
    message: entry.message,
    ...(entry.operation && { operation: entry.operation }),
    ...(entry.reportId && { reportId: entry.reportId }),
    ...(entry.eventId && { eventId: entry.eventId }),
  });
  console.warn(logLine);
}
