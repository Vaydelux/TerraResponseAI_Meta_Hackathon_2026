// @vitest-environment node
//
// src/app/api/reports/[id]/analyze/route.integration.test.ts
//
// Integration tests for the analyze route handler. The Supabase
// client, the model API, and the auth/profile context are mocked.
// The tests verify:
//   - 503 when Supabase isn't configured.
//   - 401 when the session is expired (no user).
//   - 401 when the profile is not found (deleted user).
//   - 404 NOT_FOUND when the report doesn't exist OR when the user
//     isn't a member of the report's event (RLS hides the report —
//     the route returns the same 404 for both cases, deliberately
//     NOT distinguishing "doesn't exist" from "exists but you
//     can't see it" — the brief: "Test expired sessions, wrong-event
//     access, role escalation").
//   - 409 RETRY_CAP_REACHED when retry_count is at the cap (5).
//   - The dedup-cache hit path (no model call, returns the cached
//     observation).
//   - 429 USER_AI_RATE_EXCEEDED when the per-user AI rate ceiling
//     is exceeded (the brief: "Test 429/timeout").
//   - 402 EVENT_BUDGET_EXCEEDED when the per-event budget is
//     exhausted.
//   - 503 RETRY_EXHAUSTED when the model call times out (transient).
//   - 422 SCHEMA_INVALID when the model returns an out-of-enum
//     incident_type (the brief: "Test schema mismatch").
//   - 200 success + telemetry logging on a happy-path AI call.
//
// MOCKED vs REAL: this file is fully mocked. The opt-in real Meta
// API smoke test is in src/lib/ai/muse-spark.smoke.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const { mockFrom, mockRequireServerUser, mockGetAuthContext, mockCheckAllAiCallCeilings,
  mockLookupCachedAnalysis, mockLogUsage, mockAnalyzeImage, mockIsSupabaseConfigured,
  mockCreateClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireServerUser: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockCheckAllAiCallCeilings: vi.fn(),
  mockLookupCachedAnalysis: vi.fn(),
  mockLogUsage: vi.fn(),
  mockAnalyzeImage: vi.fn(),
  mockIsSupabaseConfigured: vi.fn(() => true),
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
  requireServerUser: mockRequireServerUser,
}));

vi.mock("@/lib/auth/profile", () => ({
  getAuthContext: mockGetAuthContext,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mockIsSupabaseConfigured,
  supabaseUrl: () => "https://test.supabase.co",
  serviceRoleKey: () => "test-service-role-key",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/ai/muse-spark", () => ({
  analyzeImage: mockAnalyzeImage,
  MODEL_ID: "muse-spark-1.3",
}));

vi.mock("@/lib/ai/retry", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/ai/cost-controls", () => ({
  readCostControlConfig: () => ({
    modelCallTimeoutMs: 30000, maxRetries: 4,
    perEventBudget: 500, perUserAiCallsPerHour: 30,
    dailySpendCeilingUsd: 50, dailyRequestCeiling: 1000,
  }),
  COST_CONTROL_ERRORS: {
    DAILY_SPEND_EXCEEDED: "DAILY_SPEND_EXCEEDED",
    DAILY_REQUESTS_EXCEEDED: "DAILY_REQUESTS_EXCEEDED",
    EVENT_BUDGET_EXCEEDED: "EVENT_BUDGET_EXCEEDED",
    USER_AI_RATE_EXCEEDED: "USER_AI_RATE_EXCEEDED",
    USER_UPLOAD_RATE_EXCEEDED: "USER_UPLOAD_RATE_EXCEEDED",
    SIGNED_URL_RATE_EXCEEDED: "SIGNED_URL_RATE_EXCEEDED",
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAllAiCallCeilings: mockCheckAllAiCallCeilings,
}));

vi.mock("@/lib/ai/dedup-cache", () => ({
  lookupCachedAnalysis: mockLookupCachedAnalysis,
}));

vi.mock("@/lib/ai/usage-log", () => ({
  logUsage: mockLogUsage,
}));

vi.mock("@/lib/ai/safe-retry", () => ({
  decideManualRetry: (args: { status: string; retryCount: number }) => {
    const cap = 5;
    if (args.status !== "uploaded" && args.status !== "retryable_error") {
      return { allowed: false, reason: "wrong state", retryCount: args.retryCount, nextRetryCount: args.retryCount + 1, parkAsManualReview: false };
    }
    if (args.retryCount >= cap) {
      return { allowed: false, reason: "cap reached", retryCount: args.retryCount, nextRetryCount: args.retryCount + 1, parkAsManualReview: true };
    }
    return { allowed: true, retryCount: args.retryCount, nextRetryCount: args.retryCount + 1, parkAsManualReview: false };
  },
  MAX_MANUAL_RETRIES: 5,
}));

// Import the route handler AFTER the mocks.
import { POST } from "@/app/api/reports/[id]/analyze/route";
import { NextRequest } from "next/server";

// --- Helpers ---

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

/** Build a fake NextRequest with the route params. The second arg to
 *  a Next.js route handler is `{ params: Promise<{ id: string }> }`. */
function makeRequest(): { request: NextRequest; context: { params: Promise<{ id: string }> } } {
  const request = new NextRequest(`http://localhost/api/reports/${REPORT_ID}/analyze`, {
    method: "POST",
  });
  return { request, context: { params: Promise.resolve({ id: REPORT_ID }) } };
}

/** A supabase-js-style builder. */
function makeBuilder(result: { data: unknown; error: unknown }, methods: string[] = ["select", "eq", "in", "update", "upsert", "single", "maybeSingle"]) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = { then: promise.then.bind(promise) };
  for (const m of methods) {
    chain[m] = vi.fn(() => m === "single" || m === "maybeSingle" ? promise : chain);
  }
  return chain;
}

/** A CAS-update chain that returns { data, error } after
 *  `.update().eq().in().select().single()` OR `.maybeSingle()`.
 *  The analyze route uses .single() for the uploaded→analyzing
 *  transition and .maybeSingle() for the cache-hit's uploaded→
 *  needs_review transition. */
function makeCasUpdateBuilder(result: { data: unknown; error: unknown }, terminal: "single" | "maybeSingle" = "single") {
  const casPromise = Promise.resolve(result);
  const terminalMock = vi.fn(() => casPromise);
  const selectMock = vi.fn(() => ({ [terminal]: terminalMock }));
  const inMock = vi.fn(() => ({ select: selectMock }));
  const eqMock = vi.fn(() => ({ in: inMock }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  return { update: updateMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The analyze route checks MODEL_API_KEY before any work; set it so
  // the tests can exercise the authz/ceiling paths.
  process.env.MODEL_API_KEY = "test-key";
  mockIsSupabaseConfigured.mockReturnValue(true);
  mockRequireServerUser.mockResolvedValue({ id: USER_ID });
  mockGetAuthContext.mockResolvedValue({
    user: { id: USER_ID, role: "reporter", email: "test@terra.ai", name: "Test" },
    events: [{ event_id: EVENT_ID, role: "contributor" }],
    activeEventId: EVENT_ID,
  });
  mockCheckAllAiCallCeilings.mockResolvedValue({ ok: true });
  mockLookupCachedAnalysis.mockResolvedValue(null);
  mockLogUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.MODEL_API_KEY;
  vi.restoreAllMocks();
});

describe("POST /api/reports/[id]/analyze (mocked integration)", () => {
  it("returns 503 NOT_CONFIGURED when Supabase is not configured", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  it("returns 401 UNAUTHORIZED when the session is expired (no user)", async () => {
    mockRequireServerUser.mockRejectedValue(new Error("no session"));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the profile is not found (deleted user)", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 NOT_FOUND when the report doesn't exist (or RLS denied)", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { code: "PGRST116" } }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for wrong-event access (RLS hides the report — same 404, no cross-event leak)", async () => {
    // When the user is NOT a member of the report's event, RLS hides
    // the report row. The route's `reportErr` is set (a PGRST116
    // "JSON object requested, multiple (or no) rows returned" error
    // from the .single() call), and the route returns 404 NOT_FOUND
    // — deliberately the same response as "doesn't exist", so the
    // caller can't distinguish "no such report" from "exists but
    // you can't see it" (the brief: "no cross-event access").
    //
    // The mocked auth context has the user as a contributor of
    // EVENT_ID; a real Supabase RLS would hide a report from
    // EVENT_ID-OTHER. The mock simulates the RLS-denied read by
    // returning data: null + the PGRST116 error.
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    // Verify no model call was made (the report is unreachable).
    expect(mockAnalyzeImage).not.toHaveBeenCalled();
  });

  it("returns 409 RETRY_CAP_REACHED when retry_count is at the cap (5)", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "retryable_error",
        sha256: "abc", retry_count: 5, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    // The route also calls markAsManualReview (update) + logUsage.
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("RETRY_CAP_REACHED");
    // Verify no model call was made (the brief: "Avoid repeated
    // cost-incurring requests").
    expect(mockAnalyzeImage).not.toHaveBeenCalled();
  });

  it("returns 200 with cacheHit=true when the dedup cache hits", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue({
      reportId: "old-report",
      modelId: "muse-spark-1.3",
      promptVersion: "v1",
      schemaVersion: "v1",
      structuredObservation: { incident_type: "flooding" },
    });
    // The CAS update to "needs_review" returns a single row (success).
    // The cache-hit path uses .maybeSingle() (returns null on race-lost).
    mockFrom.mockReturnValueOnce(makeCasUpdateBuilder({ data: { id: REPORT_ID }, error: null }, "maybeSingle"));
    // The cache-hit upsert + the final transition use mockFrom.
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cacheHit).toBe(true);
    expect(body.reusedFrom).toBe("old-report");
    expect(body.observation.incident_type).toBe("flooding");
    // Verify no model call was made (cache hit).
    expect(mockAnalyzeImage).not.toHaveBeenCalled();
  });

  it("returns 429 USER_AI_RATE_EXCEEDED when the per-user AI rate is exceeded", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue(null);
    mockCheckAllAiCallCeilings.mockResolvedValue({
      ok: false, code: "USER_AI_RATE_EXCEEDED",
      message: "rate exceeded", used: 30, limit: 30,
    });
    // The route also calls logUsage on the failure path.
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("USER_AI_RATE_EXCEEDED");
    expect(mockAnalyzeImage).not.toHaveBeenCalled();
  });

  it("returns 402 EVENT_BUDGET_EXCEEDED when the per-event budget is exhausted", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue(null);
    mockCheckAllAiCallCeilings.mockResolvedValue({
      ok: false, code: "EVENT_BUDGET_EXCEEDED",
      message: "budget exhausted", used: 500, limit: 500,
    });
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe("EVENT_BUDGET_EXCEEDED");
  });

  it("returns 503 RETRY_EXHAUSTED when the model call times out (transient)", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue(null);
    mockCheckAllAiCallCeilings.mockResolvedValue({ ok: true });
    // The CAS update to "analyzing".
    mockFrom.mockReturnValueOnce(makeCasUpdateBuilder({ data: { id: REPORT_ID }, error: null }));
    // The download succeeds (returns a fake Blob).
    const fakeBlob = { arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer };
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: fakeBlob, error: null })) })) },
    });
    // The model call times out (transient failure).
    mockAnalyzeImage.mockResolvedValue({
      ok: false, kind: "timeout", error: "timed out after 30000ms",
    });
    // The route also calls markAsRetryable + persistFailedAnalysis.
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("RETRY_EXHAUSTED");
    // Verify the telemetry was logged.
    expect(mockLogUsage).toHaveBeenCalled();
  });

  it("returns 422 SCHEMA_INVALID when the model returns an out-of-enum incident_type", async () => {
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue(null);
    mockCheckAllAiCallCeilings.mockResolvedValue({ ok: true });
    mockFrom.mockReturnValueOnce(makeCasUpdateBuilder({ data: { id: REPORT_ID }, error: null }));
    const fakeBlob = { arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer };
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: fakeBlob, error: null })) })) },
    });
    mockAnalyzeImage.mockResolvedValue({
      ok: false, kind: "schema_invalid",
      error: "incident_type: invalid enum", rawOutput: "{}",
    });
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEMA_INVALID");
    expect(mockLogUsage).toHaveBeenCalled();
  });

  it("logs a successful AI call's telemetry", async () => {
    const validObservation = {
      incident_type: "flooding",
      visible_evidence: ["water"],
      preliminary_severity: 3,
      uncertainties: [],
      summary_en: "flood",
      summary_tl: "baha",
      needs_review: true,
    };
    mockFrom.mockReturnValueOnce(makeBuilder({
      data: { id: REPORT_ID, event_id: EVENT_ID, status: "uploaded",
        sha256: "abc", retry_count: 0, derivative_storage_key: "x/y.jpg", image_mime_type: "image/jpeg" },
      error: null,
    }));
    mockLookupCachedAnalysis.mockResolvedValue(null);
    mockCheckAllAiCallCeilings.mockResolvedValue({ ok: true });
    mockFrom.mockReturnValueOnce(makeCasUpdateBuilder({ data: { id: REPORT_ID }, error: null }));
    const fakeBlob = { arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer };
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: fakeBlob, error: null })) })) },
    });
    mockAnalyzeImage.mockResolvedValue({
      ok: true, observation: validObservation, rawOutput: "{}",
      usageMetadata: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      modelId: "muse-spark-1.3", promptVersion: "v1", schemaVersion: "v1",
    });
    // The route does report_analyses.upsert + final transition.
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    const { request, context } = makeRequest();
    const res = await POST(request, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.observation.incident_type).toBe("flooding");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    // Verify the telemetry was logged with outcome=succeeded.
    expect(mockLogUsage).toHaveBeenCalled();
    const logCall = mockLogUsage.mock.calls.find(
      (c: unknown[]) => (c[0] as { outcome: string }).outcome === "succeeded",
    );
    expect(logCall).toBeDefined();
  });
});
