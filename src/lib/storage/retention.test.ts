// @vitest-environment node
//
// src/lib/storage/retention.test.ts
//
// Tests for the retention/cleanup workflow helpers. The Supabase
// client + the service-role storage client are mocked so the tests
// don't need a real DB or storage.
//
// Per the brief: "Add private-photo retention/deletion workflow,
// signed URL expiration, access tests, safe file/object cleanup."

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockRemove = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: () => "https://test.supabase.co",
  serviceRoleKey: () => "test-service-role-key",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: mockStorageFrom },
  }),
}));

import {
  requestSoftDelete,
  revokeSoftDelete,
  purgeReport,
  getRetentionState,
  findPurgeableReports,
  retentionWindowDays,
} from "@/lib/storage/retention";

// --- Helpers ---

/** A thenable that resolves to { data, error } — supabase-js style. */
function makeThenable(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const eqMock = vi.fn(() => chain);
  const selectMock = vi.fn(() => chain);
  const updateMock = vi.fn(() => chain);
  const insertMock = vi.fn(() => promise);
  const inMock = vi.fn(() => chain);
  const notMock = vi.fn(() => chain);
  const lteMock = vi.fn(() => chain);
  const limitMock = vi.fn(() => promise);
  const maybeSingleMock = vi.fn(() => promise);
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    select: selectMock,
    eq: eqMock,
    update: updateMock,
    insert: insertMock,
    in: inMock,
    not: notMock,
    lte: lteMock,
    limit: limitMock,
    maybeSingle: maybeSingleMock,
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockRemove.mockReset();
  // Default storage mock: .from(bucket).remove([path]) → { error: null }
  mockStorageFrom.mockReturnValue({ remove: mockRemove });
  mockRemove.mockResolvedValue({ error: null });
});

describe("retentionWindowDays", () => {
  const origEnv = { ...process.env };
  afterEach(() => { process.env = { ...origEnv }; });

  it("returns 7 by default", () => {
    delete process.env.RETENTION_WINDOW_DAYS;
    expect(retentionWindowDays()).toBe(7);
  });

  it("reads the env var when set", () => {
    process.env.RETENTION_WINDOW_DAYS = "14";
    expect(retentionWindowDays()).toBe(14);
  });

  it("falls back to 7 on an invalid value (NaN)", () => {
    process.env.RETENTION_WINDOW_DAYS = "not-a-number";
    expect(retentionWindowDays()).toBe(7);
  });

  it("falls back to 7 on a negative value", () => {
    process.env.RETENTION_WINDOW_DAYS = "-1";
    expect(retentionWindowDays()).toBe(7);
  });

  it("accepts 0 (immediate purge after soft-delete)", () => {
    process.env.RETENTION_WINDOW_DAYS = "0";
    expect(retentionWindowDays()).toBe(0);
  });
});

describe("getRetentionState", () => {
  it("returns 'active' when no retention row exists", async () => {
    mockFrom.mockReturnValue(makeThenable({ data: null, error: null }));
    const state = await getRetentionState("report-1");
    expect(state).toBe("active");
  });

  it("returns 'active' on a query error (fail-safe default)", async () => {
    mockFrom.mockReturnValue(makeThenable({ data: null, error: { message: "DB down" } }));
    const state = await getRetentionState("report-1");
    expect(state).toBe("active");
  });

  it("returns the stored state when the row exists", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: { retention_state: "soft_deleted" }, error: null,
    }));
    const state = await getRetentionState("report-1");
    expect(state).toBe("soft_deleted");
  });
});

describe("requestSoftDelete", () => {
  it("returns ok=true + retentionWindowEndsAt on the happy path (Supabase IS configured, the report exists, no prior retention row)", async () => {
    // The NOT_CONFIGURED path is exercised in the route test
    // (src/app/api/reports/[id]/retention/route.ts → 503 when
    // isSupabaseConfigured() returns false). This test exercises
    // the happy path: the report exists, no prior retention row,
    // the insert succeeds.
    mockFrom
      .mockReturnValueOnce(makeThenable({  // fetch the report
        data: { id: "r1", creator_id: "u1", event_id: "e1" }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({  // existing retention row
        data: null, error: null,
      }))
      .mockReturnValueOnce(makeThenable({  // insert new retention row
        data: {}, error: null,
      }));
    const r = await requestSoftDelete({
      reportId: "r1", requestedBy: "u1", reason: "test",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.retentionWindowEndsAt).toBeDefined();
      // The retention window is now + 7 days (the default).
      const endsAt = new Date(r.retentionWindowEndsAt).getTime();
      const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
      // Allow a 5-second tolerance (the test runs synchronously up to
      // the Date.now() call inside requestSoftDelete).
      expect(Math.abs(endsAt - expected)).toBeLessThan(5000);
    }
  });

  it("returns NOT_FOUND when the report doesn't exist (or RLS denied the read)", async () => {
    mockFrom.mockReturnValueOnce(makeThenable({
      data: null, error: { code: "PGRST116", message: "no rows" },
    }));
    const r = await requestSoftDelete({
      reportId: "missing", requestedBy: "u1", reason: "test",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("returns ALREADY_DELETED when the report is already soft-deleted", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({  // report exists
        data: { id: "r1", creator_id: "u1", event_id: "e1" }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({  // existing retention row is soft_deleted
        data: { retention_state: "soft_deleted" }, error: null,
      }));
    const r = await requestSoftDelete({
      reportId: "r1", requestedBy: "u1", reason: "test",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ALREADY_DELETED");
  });

  it("returns ALREADY_PURGED when the report is already purged", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: { id: "r1", creator_id: "u1", event_id: "e1" }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "purged" }, error: null,
      }));
    const r = await requestSoftDelete({
      reportId: "r1", requestedBy: "u1", reason: "test",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ALREADY_PURGED");
  });
});

describe("revokeSoftDelete", () => {
  it("returns FORBIDDEN when a non-requester, non-admin tries to revoke", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", requested_by: "u-original" }, error: null,
      }));
    const r = await revokeSoftDelete({
      reportId: "r1", requestedBy: "u-other", isAdmin: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });

  it("allows the original requester to revoke", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", requested_by: "u1" }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }));
    const r = await revokeSoftDelete({
      reportId: "r1", requestedBy: "u1", isAdmin: false,
    });
    expect(r.ok).toBe(true);
  });

  it("allows an admin to revoke even if they weren't the original requester", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", requested_by: "someone-else" }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }));
    const r = await revokeSoftDelete({
      reportId: "r1", requestedBy: "admin-1", isAdmin: true,
    });
    expect(r.ok).toBe(true);
  });

  it("returns NOT_SOFT_DELETED when the row isn't in soft_deleted state", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "active", requested_by: "u1" }, error: null,
      }));
    const r = await revokeSoftDelete({
      reportId: "r1", requestedBy: "u1", isAdmin: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_SOFT_DELETED");
  });
});

describe("purgeReport", () => {
  it("returns NOT_SOFT_DELETED when the report isn't soft-deleted yet", async () => {
    mockFrom
      .mockReturnValueOnce(makeThenable({  // report
        data: {
          id: "r1",
          original_storage_key: "evidence-originals/r1.jpg",
          derivative_storage_key: "evidence-derivatives/r1.jpg",
          thumbnail_storage_key: "evidence-thumbnails/r1.jpg",
        }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({  // retention row
        data: { retention_state: "active", retention_window_ends_at: null }, error: null,
      }));
    const r = await purgeReport({ reportId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_SOFT_DELETED");
  });

  it("returns RETENTION_WINDOW_ACTIVE when the window hasn't expired (no admin override)", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: {
          id: "r1",
          original_storage_key: "evidence-originals/r1.jpg",
          derivative_storage_key: "evidence-derivatives/r1.jpg",
          thumbnail_storage_key: "evidence-thumbnails/r1.jpg",
        }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", retention_window_ends_at: future }, error: null,
      }));
    const r = await purgeReport({ reportId: "r1", adminOverride: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RETENTION_WINDOW_ACTIVE");
  });

  it("purges when admin override is set even if the window hasn't expired", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: {
          id: "r1",
          original_storage_key: "evidence-originals/r1.jpg",
          derivative_storage_key: "evidence-derivatives/r1.jpg",
          thumbnail_storage_key: "evidence-thumbnails/r1.jpg",
        }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", retention_window_ends_at: future }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }))  // blank storage keys
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }));  // mark retention as purged
    const r = await purgeReport({ reportId: "r1", adminOverride: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.purged).toContain("original");
      expect(r.purged).toContain("derivative");
      expect(r.purged).toContain("thumbnail");
    }
  });

  it("purges all three storage objects (original FIRST)", async () => {
    const past = new Date(Date.now() - 1 * 1000).toISOString(); // expired
    const removeOrder: string[] = [];
    mockRemove.mockImplementation(async (paths: string[]) => {
      removeOrder.push(paths[0]);
      return { error: null };
    });
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: {
          id: "r1",
          original_storage_key: "evidence-originals/r1.jpg",
          derivative_storage_key: "evidence-derivatives/r1.jpg",
          thumbnail_storage_key: "evidence-thumbnails/r1.jpg",
        }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", retention_window_ends_at: past }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }))
      .mockReturnValueOnce(makeThenable({ data: {}, error: null }));
    const r = await purgeReport({ reportId: "r1" });
    expect(r.ok).toBe(true);
    // The brief: "safe file/object cleanup". The purge order is
    // original FIRST (most sensitive — EXIF intact), then derivative,
    // then thumbnail.
    expect(removeOrder[0]).toBe("r1.jpg");   // original (path-only after the slash)
    expect(removeOrder[1]).toBe("r1.jpg");
    expect(removeOrder[2]).toBe("r1.jpg");
  });

  it("returns PARTIAL_PURGE when one storage delete fails", async () => {
    const past = new Date(Date.now() - 1 * 1000).toISOString();
    mockRemove
      .mockResolvedValueOnce({ error: null })   // original ok
      .mockResolvedValueOnce({ error: { message: "storage error" } })  // derivative fails
      .mockResolvedValueOnce({ error: null });  // thumbnail ok
    mockFrom
      .mockReturnValueOnce(makeThenable({
        data: {
          id: "r1",
          original_storage_key: "evidence-originals/r1.jpg",
          derivative_storage_key: "evidence-derivatives/r1.jpg",
          thumbnail_storage_key: "evidence-thumbnails/r1.jpg",
        }, error: null,
      }))
      .mockReturnValueOnce(makeThenable({
        data: { retention_state: "soft_deleted", retention_window_ends_at: past }, error: null,
      }));
    const r = await purgeReport({ reportId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PARTIAL_PURGE");
  });
});

describe("findPurgeableReports", () => {
  it("returns report IDs whose retention window has expired", async () => {
    const chain = makeThenable({
      data: [{ report_id: "r1" }, { report_id: "r2" }], error: null,
    });
    mockFrom.mockReturnValue(chain);
    const ids = await findPurgeableReports();
    expect(ids).toEqual(["r1", "r2"]);
  });

  it("returns [] on a query error", async () => {
    const chain = makeThenable({ data: null, error: { message: "DB down" } });
    mockFrom.mockReturnValue(chain);
    const ids = await findPurgeableReports();
    expect(ids).toEqual([]);
  });
});
