// src/lib/ai/usage-log.test.ts
//
// Tests for the AI usage telemetry inserter + summarizer. The
// Supabase client is mocked so the tests don't need a real DB.
// Tests cover:
//   - The insert row shape (model_id, prompt_version, tokens, latency,
//     estimated_cost, outcome).
//   - The error-message sanitizer (caps length, strips JWTs/API keys/
//     Bearer tokens/base64 blobs).
//   - The snake_case ↔ camelCase normalization (the cache-hit path
//     may pass camelCase; the model-call path passes snake_case).
//   - The "never throws" contract (a failed insert is logged via
//     console.error; the request flow continues).
//   - The daily summary aggregation (SUM(cost) + COUNT + byOutcome).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockCreateClient = vi.fn(() => ({ from: mockFrom }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));
vi.mock("@/lib/supabase/env", () => ({
  supabaseUrl: () => "https://staging.test.invalid",
  serviceRoleKey: () => "fake-server-key-for-tests-only",
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
}));

import { logUsage, getDailyUsageSummary } from "@/lib/ai/usage-log";

beforeEach(() => {
  mockFrom.mockReset();
  mockCreateClient.mockClear();
});

/** A supabase-js-style builder. The `.insert(row)` returns a thenable
 *  that resolves to { data, error }. We capture the row via the mock. */
function makeInsertBuilder(result: { data: unknown; error: unknown }) {
  const insertMock = vi.fn();
  const promise = Promise.resolve(result);
  insertMock.mockReturnValue(promise);
  return { insert: insertMock } as unknown as Record<string, unknown>;
}

/** A supabase-js-style builder for select queries. */
function makeSelectBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => promise),
  };
  return chain;
}

describe("logUsage", () => {
  it("uses a trusted service client, not a user-session client, for telemetry", async () => {
    const builder = makeInsertBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({ reportId: "r1", eventId: "e1", userId: "u1", outcome: "succeeded" });
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://staging.test.invalid",
      "fake-server-key-for-tests-only",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });
  it("inserts a row with the expected shape on success", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({
      reportId: "r1",
      eventId: "e1",
      userId: "u1",
      modelId: "muse-spark-1.3",
      promptVersion: "v1",
      schemaVersion: "v1",
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      latencyMs: 1500,
      outcome: "succeeded",
    });
    // Verify the row shape passed to .insert()
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row.report_id).toBe("r1");
    expect(row.event_id).toBe("e1");
    expect(row.user_id).toBe("u1");
    expect(row.model_id).toBe("muse-spark-1.3");
    expect(row.prompt_version).toBe("v1");
    expect(row.schema_version).toBe("v1");
    expect(row.prompt_tokens).toBe(100);
    expect(row.completion_tokens).toBe(50);
    expect(row.total_tokens).toBe(150);
    expect(row.latency_ms).toBe(1500);
    expect(row.outcome).toBe("succeeded");
    expect(row.estimated_cost_usd).toBeGreaterThan(0);
    expect(row.cost_basis).toBe("tokens");
    expect(row.utc_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normalizes snake_case token fields to the DB column names", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({
      reportId: "r1",
      eventId: "e1",
      userId: "u1",
      usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      outcome: "succeeded",
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    // The DB columns are snake_case; the provider's usage response is
    // snake_case. logUsage accepts both shapes and normalizes to the
    // DB column names.
    expect(row.prompt_tokens).toBe(200);
    expect(row.completion_tokens).toBe(100);
    expect(row.total_tokens).toBe(300);
  });

  it("normalizes camelCase token fields (cache-hit path) to the DB column names", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({
      reportId: "r1",
      eventId: "e1",
      userId: "u1",
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      outcome: "succeeded",
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.prompt_tokens).toBe(200);
    expect(row.completion_tokens).toBe(100);
    expect(row.total_tokens).toBe(300);
  });

  it("uses cost_basis='flat' when usage is null (no token counts)", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({
      reportId: "r1",
      eventId: "e1",
      userId: "u1",
      usage: null,
      outcome: "transient_failed",
      errorMessage: "timeout",
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.cost_basis).toBe("flat");
    expect(row.estimated_cost_usd).toBeGreaterThan(0); // the flat rate
  });

  it("sanitizes error messages: strips JWTs", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature-here";
    await logUsage({
      reportId: "r1", eventId: "e1", userId: "u1",
      outcome: "permanent_failed",
      errorMessage: `Auth error: ${jwt}`,
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.error_message).not.toContain(jwt);
    expect(row.error_message).toContain("[redacted-jwt]");
  });

  it("sanitizes error messages: strips Bearer tokens", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    await logUsage({
      reportId: "r1", eventId: "e1", userId: "u1",
      outcome: "permanent_failed",
      errorMessage: "Request failed with Bearer abc123.456.789",
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.error_message).toContain("[redacted-bearer]");
    expect(row.error_message).not.toContain("abc123.456.789");
  });

  it("sanitizes error messages: strips long hex (API keys)", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    const hex = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // 32 hex chars
    await logUsage({
      reportId: "r1", eventId: "e1", userId: "u1",
      outcome: "permanent_failed",
      errorMessage: `API key ${hex} rejected`,
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.error_message).not.toContain(hex);
    expect(row.error_message).toContain("[redacted-key]");
  });

  it("sanitizes error messages: caps length at 200 chars + ellipsis", async () => {
    const builder = makeInsertBuilder({ data: [{}], error: null });
    mockFrom.mockReturnValue(builder);
    // Use a realistic error message with spaces (so the base64-blob
    // regex doesn't strip it first). 500 chars total.
    const longMsg = Array.from({ length: 100 }, () => "word word").join(" ");
    expect(longMsg.length).toBeGreaterThan(200);
    await logUsage({
      reportId: "r1", eventId: "e1", userId: "u1",
      outcome: "permanent_failed",
      errorMessage: longMsg,
    });
    const insertMock = builder.insert as ReturnType<typeof vi.fn>;
    const row = insertMock.mock.calls[0][0];
    expect(row.error_message.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
    expect(row.error_message).toMatch(/…$/);
  });

  it("never throws — a failed insert is logged via console.error", async () => {
    const builder = makeInsertBuilder({ data: null, error: { message: "DB down" } });
    mockFrom.mockReturnValue(builder);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // The await must NOT throw.
    await expect(logUsage({
      reportId: "r1", eventId: "e1", userId: "u1",
      outcome: "succeeded",
    })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("getDailyUsageSummary", () => {
  it("returns 0 cost + 0 requests when the day is empty", async () => {
    mockFrom.mockReturnValue(makeSelectBuilder({ data: [], error: null }));
    const s = await getDailyUsageSummary("2024-09-15");
    expect(s.totalCostUsd).toBe(0);
    expect(s.totalRequests).toBe(0);
    expect(s.byOutcome).toEqual({});
  });

  it("sums cost + counts by outcome", async () => {
    mockFrom.mockReturnValue(makeSelectBuilder({
      data: [
        { estimated_cost_usd: 0.5, outcome: "succeeded" },
        { estimated_cost_usd: 0.25, outcome: "succeeded" },
        { estimated_cost_usd: 0.1, outcome: "transient_failed" },
        { estimated_cost_usd: 0.0, outcome: "rate_limited" },
      ],
      error: null,
    }));
    const s = await getDailyUsageSummary("2024-09-15");
    expect(s.totalCostUsd).toBeCloseTo(0.85, 5);
    expect(s.totalRequests).toBe(4);
    expect(s.byOutcome.succeeded).toBe(2);
    expect(s.byOutcome.transient_failed).toBe(1);
    expect(s.byOutcome.rate_limited).toBe(1);
  });

  it("skips rows with non-numeric cost", async () => {
    mockFrom.mockReturnValue(makeSelectBuilder({
      data: [
        { estimated_cost_usd: 0.5, outcome: "succeeded" },
        { estimated_cost_usd: "garbage", outcome: "succeeded" },
        { estimated_cost_usd: null, outcome: "succeeded" },
      ],
      error: null,
    }));
    const s = await getDailyUsageSummary("2024-09-15");
    expect(s.totalCostUsd).toBeCloseTo(0.5, 5);
    expect(s.totalRequests).toBe(3); // count is row count, not sum
  });

  it("returns 0/0 on a query error", async () => {
    mockFrom.mockReturnValue(makeSelectBuilder({
      data: null, error: { message: "DB down" },
    }));
    const s = await getDailyUsageSummary("2024-09-15");
    expect(s.totalCostUsd).toBe(0);
    expect(s.totalRequests).toBe(0);
  });
});
