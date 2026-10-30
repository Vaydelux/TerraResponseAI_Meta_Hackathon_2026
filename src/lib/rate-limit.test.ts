// src/lib/rate-limit.test.ts
//
// Tests for the server-enforced rate limits. The Supabase client is
// mocked so the tests don't need a real DB. The tests cover:
//   - The decision shape (ok=true vs ok=false with code/message/used/limit).
//   - The fail-OPEN behavior on a count-query error (the ceiling
//     enforces when the count works; a DB hiccup doesn't block the
//     request — the brief: "no silent failures" + "no blocked uploads").
//   - The boundary behavior (used === limit → blocked; used < limit → ok).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
}));

import {
  checkUserUploadRate,
  checkUserAiCallRate,
  checkEventAiBudget,
  checkSignedUrlRate,
  checkDailySpendCeiling,
  checkDailyRequestCeiling,
  checkAllAiCallCeilings,
} from "@/lib/rate-limit";
import { COST_CONTROL_ERRORS } from "@/lib/ai/cost-controls";

/** A thenable that resolves to { count, error } for count queries.
 *  supabase-js's chain methods return a thenable FilterBuilder; the
 *  await resolves the Promise<{ count, error, data }> the .select()
 *  with `{ count: 'exact', head: true }` produces. */
function makeCountThenable(count: number | null, error: unknown = null) {
  const result = Promise.resolve({ count, error, data: null });
  // Attach chain methods so .select().eq().gte() returns the same
  // thenable (each method returns `this`). The route handler
  // destructures `const { count, error } = await ...`.
  const chain: Record<string, unknown> = {
    then: result.then.bind(result),
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    range: () => chain,
  };
  return chain;
}

/** A thenable that resolves to { data, error } for row queries
 *  (used by checkDailySpendCeiling which SUMs estimated_cost_usd
 *  from a row array). */
function makeRowsThenable(rows: unknown[], error: unknown = null) {
  const result = Promise.resolve({ data: rows, error, count: null });
  const chain: Record<string, unknown> = {
    then: result.then.bind(result),
    select: () => chain,
    eq: () => chain,
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("checkUserUploadRate", () => {
  it("allows when used < limit (default 20)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(5));
    const r = await checkUserUploadRate("user-1");
    expect(r.ok).toBe(true);
  });

  it("blocks when used === limit", async () => {
    mockFrom.mockReturnValue(makeCountThenable(20));
    const r = await checkUserUploadRate("user-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.USER_UPLOAD_RATE_EXCEEDED);
      expect(r.used).toBe(20);
      expect(r.limit).toBe(20);
      expect(r.message).toContain("20/20");
    }
  });

  it("blocks when used > limit", async () => {
    mockFrom.mockReturnValue(makeCountThenable(50));
    const r = await checkUserUploadRate("user-1");
    expect(r.ok).toBe(false);
  });

  it("fails OPEN on a count-query error (allows the upload)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(null, { message: "DB down" }));
    const r = await checkUserUploadRate("user-1");
    expect(r.ok).toBe(true);
  });
});

describe("checkUserAiCallRate", () => {
  it("allows when used < limit (default 30)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(10));
    const r = await checkUserAiCallRate("user-1");
    expect(r.ok).toBe(true);
  });

  it("blocks when used === limit (30)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(30));
    const r = await checkUserAiCallRate("user-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.USER_AI_RATE_EXCEEDED);
      expect(r.limit).toBe(30);
    }
  });

  it("fails OPEN on a count-query error", async () => {
    mockFrom.mockReturnValue(makeCountThenable(null, { message: "DB down" }));
    const r = await checkUserAiCallRate("user-1");
    expect(r.ok).toBe(true);
  });
});

describe("checkEventAiBudget", () => {
  it("allows when used < budget (default 500)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(100));
    const r = await checkEventAiBudget("evt-1");
    expect(r.ok).toBe(true);
  });

  it("blocks when used === budget", async () => {
    mockFrom.mockReturnValue(makeCountThenable(500));
    const r = await checkEventAiBudget("evt-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.EVENT_BUDGET_EXCEEDED);
      expect(r.limit).toBe(500);
    }
  });

  it("fails OPEN on a count-query error", async () => {
    mockFrom.mockReturnValue(makeCountThenable(null, { message: "DB down" }));
    const r = await checkEventAiBudget("evt-1");
    expect(r.ok).toBe(true);
  });
});

describe("checkSignedUrlRate", () => {
  it("allows when used < limit (default 60/min)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(30));
    const r = await checkSignedUrlRate("user-1");
    expect(r.ok).toBe(true);
  });

  it("blocks when used === limit", async () => {
    mockFrom.mockReturnValue(makeCountThenable(60));
    const r = await checkSignedUrlRate("user-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.SIGNED_URL_RATE_EXCEEDED);
      expect(r.limit).toBe(60);
    }
  });

  it("fails OPEN on a count-query error", async () => {
    mockFrom.mockReturnValue(makeCountThenable(null, { message: "DB down" }));
    const r = await checkSignedUrlRate("user-1");
    expect(r.ok).toBe(true);
  });
});

describe("checkDailySpendCeiling", () => {
  it("allows when the day's total < ceiling (default $50)", async () => {
    mockFrom.mockReturnValue(makeRowsThenable([
      { estimated_cost_usd: 0.5 },
      { estimated_cost_usd: 0.25 },
      { estimated_cost_usd: 1.0 },
    ]));
    const r = await checkDailySpendCeiling();
    expect(r.ok).toBe(true);
  });

  it("blocks when the day's total >= ceiling", async () => {
    mockFrom.mockReturnValue(makeRowsThenable([
      { estimated_cost_usd: 30 },
      { estimated_cost_usd: 20 },
      { estimated_cost_usd: 5 },
    ]));
    const r = await checkDailySpendCeiling();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.DAILY_SPEND_EXCEEDED);
      expect(r.limit).toBe(50);
      expect(r.used).toBeCloseTo(55, 5);
    }
  });

  it("skips rows with non-numeric estimated_cost_usd", async () => {
    mockFrom.mockReturnValue(makeRowsThenable([
      { estimated_cost_usd: 0.5 },
      { estimated_cost_usd: "not-a-number" },
      { estimated_cost_usd: null },
      { estimated_cost_usd: 1.0 },
    ]));
    const r = await checkDailySpendCeiling();
    expect(r.ok).toBe(true); // 0.5 + 1.0 = 1.5 < 50
  });

  it("fails OPEN on a query error", async () => {
    mockFrom.mockReturnValue(makeRowsThenable([], { message: "DB down" }));
    const r = await checkDailySpendCeiling();
    expect(r.ok).toBe(true);
  });
});

describe("checkDailyRequestCeiling", () => {
  it("allows when the day's count < ceiling (default 1000)", async () => {
    mockFrom.mockReturnValue(makeCountThenable(500));
    const r = await checkDailyRequestCeiling();
    expect(r.ok).toBe(true);
  });

  it("blocks when the day's count === ceiling", async () => {
    mockFrom.mockReturnValue(makeCountThenable(1000));
    const r = await checkDailyRequestCeiling();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.DAILY_REQUESTS_EXCEEDED);
      expect(r.limit).toBe(1000);
    }
  });

  it("fails OPEN on a count-query error", async () => {
    mockFrom.mockReturnValue(makeCountThenable(null, { message: "DB down" }));
    const r = await checkDailyRequestCeiling();
    expect(r.ok).toBe(true);
  });
});

describe("checkAllAiCallCeilings", () => {
  it("returns ok when ALL ceilings pass", async () => {
    // The function calls 4 ceilings in order: user, event, spend, reqs.
    // Each calls .from("ai_usage_log"). We need to mock each call to
    // return a different thenable.
    mockFrom
      .mockReturnValueOnce(makeCountThenable(5))      // user AI rate ok
      .mockReturnValueOnce(makeCountThenable(100))     // event budget ok
      .mockReturnValueOnce(makeRowsThenable([]))       // empty day ok
      .mockReturnValueOnce(makeCountThenable(0));      // daily requests ok
    const r = await checkAllAiCallCeilings({
      userId: "user-1",
      eventId: "evt-1",
    });
    expect(r.ok).toBe(true);
  });

  it("short-circuits at the FIRST failure (per-user rate)", async () => {
    mockFrom.mockReturnValueOnce(makeCountThenable(30)); // user rate exceeded
    const r = await checkAllAiCallCeilings({
      userId: "user-1",
      eventId: "evt-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.USER_AI_RATE_EXCEEDED);
    }
    // The event/spend/reqs queries should NOT have been called
    // (short-circuit at the first failure).
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("short-circuits at the per-event budget if the user rate passes", async () => {
    mockFrom
      .mockReturnValueOnce(makeCountThenable(5))   // user rate ok
      .mockReturnValueOnce(makeCountThenable(500)); // event budget exceeded
    const r = await checkAllAiCallCeilings({
      userId: "user-1",
      eventId: "evt-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.EVENT_BUDGET_EXCEEDED);
    }
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("short-circuits at the daily spend if user + event pass", async () => {
    mockFrom
      .mockReturnValueOnce(makeCountThenable(5))
      .mockReturnValueOnce(makeCountThenable(100))
      .mockReturnValueOnce(makeRowsThenable([{ estimated_cost_usd: 60 }]));
    const r = await checkAllAiCallCeilings({
      userId: "user-1",
      eventId: "evt-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(COST_CONTROL_ERRORS.DAILY_SPEND_EXCEEDED);
    }
  });
});
