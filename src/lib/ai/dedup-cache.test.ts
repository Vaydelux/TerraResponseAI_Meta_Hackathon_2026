// src/lib/ai/dedup-cache.test.ts
//
// Tests for the duplicate-hash cache. The Supabase client is mocked
// so the tests don't need a real DB. The tests cover:
//   - Cache hit: returns the cached analysis when a same-sha256
//     report exists in the event with a succeeded analysis.
//   - Cache miss: returns null when no match (different sha256,
//     different event, or no analysis row).
//   - State gate: only reuses when the existing report is in
//     needs_review or reviewed (NOT uploaded/analyzing/
//     retryable_error/needs_manual_review).
//   - Processing status gate: only reuses when processing_status =
//     "succeeded" (not "failed" / "schema_invalid").

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
}));

import { lookupCachedAnalysis } from "@/lib/ai/dedup-cache";

/** A thenable that resolves to { data, error }. */
function makeThenable(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const eqMock = vi.fn(() => chain);
  const selectMock = vi.fn(() => chain);
  const orderMock = vi.fn(() => chain);
  const limitMock = vi.fn(() => promise);
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    select: selectMock,
    eq: eqMock,
    order: orderMock,
    limit: limitMock,
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("lookupCachedAnalysis", () => {
  it("returns the cached analysis when a same-sha256 needs_review report exists", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "needs_review",
        report_analyses: [{
          model_id: "muse-spark-1.3",
          prompt_version: "v1",
          schema_version: "v1",
          processing_status: "succeeded",
          structured_observation: { incident_type: "flooding" },
        }],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).not.toBeNull();
    expect(cached!.reportId).toBe("report-existing");
    expect(cached!.modelId).toBe("muse-spark-1.3");
    expect(cached!.structuredObservation.incident_type).toBe("flooding");
  });

  it("returns the cached analysis when the existing report is reviewed", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "reviewed",
        report_analyses: [{
          model_id: "muse-spark-1.3",
          prompt_version: "v1",
          schema_version: "v1",
          processing_status: "succeeded",
          structured_observation: { incident_type: "debris" },
        }],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).not.toBeNull();
    expect(cached!.structuredObservation.incident_type).toBe("debris");
  });

  it("returns null when no report matches the sha256 in the event", async () => {
    mockFrom.mockReturnValue(makeThenable({ data: [], error: null }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).toBeNull();
  });

  it("returns null when the query errors (fail-OPEN: treat as cache miss)", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: null, error: { message: "DB down" },
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).toBeNull();
  });

  it("returns null when the existing report is still uploaded (not analyzed yet)", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "uploaded",
        report_analyses: [],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).toBeNull();
  });

  it("returns null when the existing report is in retryable_error (analysis failed)", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "retryable_error",
        report_analyses: [{
          model_id: "muse-spark-1.3",
          prompt_version: "v1",
          schema_version: "v1",
          processing_status: "failed",
          structured_observation: { error: "transient" },
        }],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    // The brief: "Avoid repeated cost-incurring requests." But the
    // existing analysis FAILED — reusing it would propagate the
    // failure. Return null so the new report runs its own analysis.
    expect(cached).toBeNull();
  });

  it("returns null when the existing report is in needs_manual_review", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "needs_manual_review",
        report_analyses: [{
          model_id: "muse-spark-1.3",
          prompt_version: "v1",
          schema_version: "v1",
          processing_status: "schema_invalid",
          structured_observation: { error: "bad schema" },
        }],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).toBeNull();
  });

  it("returns null when the analysis row exists but processing_status != 'succeeded'", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: [{
        id: "report-existing",
        status: "needs_review",
        report_analyses: [{
          model_id: "muse-spark-1.3",
          prompt_version: "v1",
          schema_version: "v1",
          processing_status: "failed",
          structured_observation: { error: "transient" },
        }],
      }],
      error: null,
    }));
    const cached = await lookupCachedAnalysis({
      eventId: "evt-1",
      sha256: "abc123",
    });
    expect(cached).toBeNull();
  });

  it("filters by event_id (no cross-event leak)", async () => {
    const thenable = makeThenable({ data: [], error: null });
    mockFrom.mockReturnValue(thenable);
    await lookupCachedAnalysis({ eventId: "evt-A", sha256: "abc" });
    // Verify the query was filtered by event_id.
    // The mock's chain.eq is called with ("event_id", "evt-A") and
    // ("sha256", "abc").
    expect(thenable.eq).toHaveBeenCalledWith("event_id", "evt-A");
    expect(thenable.eq).toHaveBeenCalledWith("sha256", "abc");
  });
});
