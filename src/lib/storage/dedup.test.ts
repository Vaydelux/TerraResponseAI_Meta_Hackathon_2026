// src/lib/storage/dedup.test.ts
//
// Tests for the SHA-256 duplicate check. The route handler's
// createSupabaseServerClient is mocked so the tests don't need a
// real DB. The tests verify:
//   - On a row match, isDuplicate=true with the existing id.
//   - On no match, isDuplicate=false, existingReportId=null.
//   - On query errors or a missing result, the function fails closed
//     rather than creating redundant evidence or paying for duplicate AI.

import { describe, it, expect, vi, beforeEach } from "vitest";

// The mock replaces the module-level supabase client factory.
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
}));

// Import AFTER the mock is registered.
import { checkDuplicate } from "@/lib/storage/dedup";

/** Build a fluent mock query chain (eq, limit → {data, error}). */
function mockQueryChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("checkDuplicate", () => {
  it("returns isDuplicate=true with the existing report id when a row matches", async () => {
    const existingId = "11111111-1111-1111-1111-111111111111";
    const chain = mockQueryChain({ data: [{ id: existingId }], error: null });
    mockFrom.mockReturnValue(chain);
    const result = await checkDuplicate("evt-id", "abc123");
    expect(result.isDuplicate).toBe(true);
    expect(result.existingReportId).toBe(existingId);
    // Verify the query was filtered by event_id AND sha256.
    expect(chain.eq).toHaveBeenCalledWith("event_id", "evt-id");
    expect(chain.eq).toHaveBeenCalledWith("sha256", "abc123");
  });

  it("returns isDuplicate=false when no row matches", async () => {
    const chain = mockQueryChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);
    const result = await checkDuplicate("evt-id", "abc123");
    expect(result.isDuplicate).toBe(false);
    expect(result.existingReportId).toBeNull();
  });

  it("fails closed when the database returns null instead of a result array", async () => {
    const chain = mockQueryChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);
    await expect(checkDuplicate("evt-id", "abc123")).rejects.toThrow("Duplicate lookup");
  });

  it("fails CLOSED on a Supabase error without inserting another report", async () => {
    const chain = mockQueryChain({ data: null, error: { message: "DB down" } });
    mockFrom.mockReturnValue(chain);
    await expect(checkDuplicate("evt-id", "abc123")).rejects.toThrow("Duplicate lookup");
  });

  it("never queries across events — only filters by the authorized event_id", async () => {
    // The RLS policies enforce event-scope at the DB, but the app-layer
    // query also filters by event_id (defense-in-depth). The test
    // verifies the WHERE clause is correctly scoped.
    const chain = mockQueryChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);
    await checkDuplicate("evt-id-A", "abc123");
    expect(chain.eq).toHaveBeenCalledWith("event_id", "evt-id-A");
    expect(chain.eq).not.toHaveBeenCalledWith("event_id", "evt-id-B");
  });

  it("uses limit(1) so the query is cheap (no need to count all duplicates)", async () => {
    const chain = mockQueryChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);
    await checkDuplicate("evt-id", "abc123");
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
});
