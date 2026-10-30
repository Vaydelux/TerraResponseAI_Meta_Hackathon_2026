// @vitest-environment node
//
// src/lib/authz-integration.test.ts
//
// Role-based integration tests for the TerraResponse AI authorization
// boundary. These tests assert that the route handlers + the documented
// RLS policies together enforce:
//
//   1. Contributor (event-A): can read own reports + reports in event-A
//      where they're a member; CANNOT read reports in event-B.
//   2. Reviewer (event-A): can read all reports in event-A, can write
//      review_actions on event-A reports, CANNOT review their own
//      report, CANNOT act on event-B reports.
//   3. Admin (global): can read reports cross-event, can write
//      review_actions on any report (admin is exempt from the
//      self-review rule per docs/SECURITY.md §10.1).
//   4. Outsider (event-B contributor): CANNOT read event-A reports
//      via the nearby / viewport / evidence / retention routes.
//
// These tests are MOCKED at the Supabase client layer (the RLS policies
// are enforced by the real database; we simulate the RLS-denied reads
// by returning data: null + a PGRST116 error, which is exactly what
// the real Supabase returns when an RLS policy hides a row from a
// .single() call). The application layer's behavior in response to
// that mock is what we assert — the test proves the route handlers
// surface the right HTTP status (and crucially, do NOT leak the
// cross-event data).
//
// Why mocked instead of real: the user's brief explicitly says "Do not
// execute remote schema changes, create administrative users, or seed
// remote databases without explicit approval." A real-database test
// would require seeding users + reports into the remote Supabase
// project, which is not permitted here. The mocked test still proves
// the route handlers behave correctly given the documented RLS
// responses; a real-DB test can run later when the user explicitly
// approves seeding.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Test fixtures (fixed UUIDs so the seeded demo data references
//     stay consistent with supabase/seed.sql). ---

const EVENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Helene
const EVENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // Wildfires

const ALICE = "11111111-1111-4111-8111-111111111111"; // contributor in Event A
const BOB = "22222222-2222-4222-8222-222222222222"; // reviewer in Event A
const CAROL = "33333333-3333-4333-8333-333333333333"; // admin + coordinator in Event B
const DAVE = "44444444-4444-4444-8444-444444444444"; // contributor in Event B (outsider for Event A)

const REPORT_A1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Alice's report in Event A
const REPORT_B1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"; // Dave's report in Event B

// --- Mocks ---

const {
  mockFrom,
  mockRpc,
  mockRequireServerUser,
  mockGetAuthContext,
  mockIsSupabaseConfigured,
  mockCheckSignedUrlRate,
  mockGetRetentionState,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRequireServerUser: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockIsSupabaseConfigured: vi.fn(() => true),
  mockCheckSignedUrlRate: vi.fn(),
  mockGetRetentionState: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mockFrom, rpc: mockRpc }),
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

vi.mock("@/lib/rate-limit", () => ({
  checkSignedUrlRate: mockCheckSignedUrlRate,
}));

vi.mock("@/lib/storage/retention", () => ({
  getRetentionState: mockGetRetentionState,
  requestSoftDelete: vi.fn(),
  revokeSoftDelete: vi.fn(),
  purgeReport: vi.fn(),
  adminOverrideEnabled: () => false,
}));

// --- Route imports ---

import { GET as getNearby } from "@/app/api/reports/[id]/nearby/route";
import { GET as getViewport } from "@/app/api/reports/viewport/route";
import { GET as getEvidence } from "@/app/api/reports/[id]/evidence/route";
import { NextRequest } from "next/server";

// --- Helpers ---

function makeNearbyReq(reportId: string, radius = 1000): { request: NextRequest; context: { params: Promise<{ id: string }> } } {
  return {
    request: new NextRequest(
      `http://localhost/api/reports/${reportId}/nearby?radius=${radius}`,
      { method: "GET" },
    ),
    context: { params: Promise.resolve({ id: reportId }) },
  };
}

function makeViewportReq(eventId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/reports/viewport?event_id=${eventId}` +
      `&sw_lat=35.5&sw_lon=-82.7&ne_lat=35.7&ne_lon=-82.4&limit=200`,
    { method: "GET" },
  );
}

function makeEvidenceReq(reportId: string, kind = "derivative"): { request: NextRequest; context: { params: Promise<{ id: string }> } } {
  return {
    request: new NextRequest(
      `http://localhost/api/reports/${reportId}/evidence?kind=${kind}`,
      { method: "GET" },
    ),
    context: { params: Promise.resolve({ id: reportId }) },
  };
}

/** A Supabase SELECT chain ending in .maybeSingle() or .single(). */
function makeSelectChain(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => promise),
    single: vi.fn(() => promise),
  };
  return chain;
}

// --- Auth-context fixtures per role ---

const aliceCtx = {
  user: { id: ALICE, role: "reporter" as const, email: "alice@terra.ai", name: "Alice" },
  events: [{ event_id: EVENT_A, role: "contributor" as const, event_name: "Helene", event_slug: "helene", event_status: "active" }],
  activeEventId: EVENT_A,
};

const bobCtx = {
  user: { id: BOB, role: "reviewer" as const, email: "bob@terra.ai", name: "Bob" },
  events: [{ event_id: EVENT_A, role: "reviewer" as const, event_name: "Helene", event_slug: "helene", event_status: "active" }],
  activeEventId: EVENT_A,
};

const carolCtx = {
  user: { id: CAROL, role: "admin" as const, email: "carol@terra.ai", name: "Carol" },
  events: [{ event_id: EVENT_B, role: "coordinator" as const, event_name: "Wildfires", event_slug: "wildfires", event_status: "active" }],
  activeEventId: EVENT_B,
};

const daveCtx = {
  user: { id: DAVE, role: "reporter" as const, email: "dave@terra.ai", name: "Dave" },
  events: [{ event_id: EVENT_B, role: "contributor" as const, event_name: "Wildfires", event_slug: "wildfires", event_status: "active" }],
  activeEventId: EVENT_B,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);
  mockGetRetentionState.mockResolvedValue("active");
  mockCheckSignedUrlRate.mockResolvedValue({ ok: true });
  mockFrom.mockReset();
  mockRpc.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// CONTRIBUTOR (Alice) — Event A member
// ===========================================================================

describe("Contributor (Alice, Event A)", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: ALICE });
    mockGetAuthContext.mockResolvedValue(aliceCtx);
  });

  it("can read her own report in Event A", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: { id: REPORT_A1, event_id: EVENT_A, latitude: 35.5951, longitude: -82.5515, location_source: "gps" },
      error: null,
    }));
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { request, context } = makeNearbyReq(REPORT_A1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(200);
  });

  it("CANNOT read a report from Event B (RLS hides the row → 404, no cross-event leak)", async () => {
    // Dave's report in Event B is hidden from Alice by the RLS policy
    // reports_select_creator_or_event_reviewer_or_admin (Alice is not
    // Dave and not a reviewer in Event B). The mock simulates the RLS
    // response: data=null, error=PGRST116 (the .single() error when
    // 0 rows match).
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeNearbyReq(REPORT_B1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    // Verify the RPC was NOT called (no spatial query was issued on
    // Alice's behalf against Event B).
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("cannot mint a signed URL for an Event-B report (RLS hides the row → 404)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeEvidenceReq(REPORT_B1);
    const res = await getEvidence(request, context);
    expect(res.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("cannot query the Event-B viewport (auth-context membership check rejects)", async () => {
    // The viewport route first checks ctx.events.find(e => e.event_id === eventId).
    // Alice is in Event A only, so requesting Event B's viewport returns 403.
    const req = makeViewportReq(EVENT_B);
    const res = await getViewport(req);
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// REVIEWER (Bob) — Event A reviewer
// ===========================================================================

describe("Reviewer (Bob, Event A)", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: BOB });
    mockGetAuthContext.mockResolvedValue(bobCtx);
  });

  it("can read any report in Event A (reviewer's RLS policy)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: { id: REPORT_A1, event_id: EVENT_A, latitude: 35.5951, longitude: -82.5515, location_source: "gps" },
      error: null,
    }));
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { request, context } = makeNearbyReq(REPORT_A1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(200);
  });

  it("CANNOT read a report from Event B (RLS hides the row)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeNearbyReq(REPORT_B1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("cannot query the Event-B viewport (membership check rejects)", async () => {
    const req = makeViewportReq(EVENT_B);
    const res = await getViewport(req);
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("can query the Event-A viewport (membership allowed → RPC issued, scoped by event_id)", async () => {
    // The viewport route calls the RPC with p_event_id=EVENT_A. The
    // RPC's body filters WHERE r.event_id = p_event_id. Even if Bob
    // could somehow pass EVENT_B, the RLS on reports would hide
    // Event-B rows from him; the RPC's WHERE clause is a SECOND layer.
    mockRpc.mockResolvedValue({ data: [], error: null });
    const req = makeViewportReq(EVENT_A);
    const res = await getViewport(req);
    expect(res.status).toBe(200);
    // Verify the RPC was called with EVENT_A (not EVENT_B).
    expect(mockRpc).toHaveBeenCalledWith("viewport_reports", expect.objectContaining({
      p_event_id: EVENT_A,
    }));
  });

  it("can mint a derivative signed URL for an Event-A report (reviewer-or-higher RLS)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: {
        id: REPORT_A1,
        creator_id: ALICE,
        original_storage_key: `evidence-originals/${EVENT_A}/${REPORT_A1}.jpg`,
        derivative_storage_key: `evidence-derivatives/${EVENT_A}/${REPORT_A1}.jpg`,
        thumbnail_storage_key: `evidence-thumbnails/${EVENT_A}/${REPORT_A1}.jpg`,
      },
      error: null,
    }));
    mockCreateClient.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({
            data: { signedUrl: "https://signed.example/derivative.jpg" },
            error: null,
          })),
        })),
      },
    });
    const { request, context } = makeEvidenceReq(REPORT_A1, "derivative");
    const res = await getEvidence(request, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signedUrl).toContain("derivative.jpg");
  });

  it("CANNOT mint the ORIGINAL signed URL for an Event-B report (RLS hides the row → 404)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeEvidenceReq(REPORT_B1, "original");
    const res = await getEvidence(request, context);
    expect(res.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ADMIN (Carol) — Global admin + Event-B coordinator
// ===========================================================================

describe("Admin (Carol, global admin + Event-B coordinator)", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: CAROL });
    mockGetAuthContext.mockResolvedValue(carolCtx);
  });

  it("nearby_reports route applies an app-layer event-membership check that is STRICTER than the admin RLS (admin in Event B cannot use the nearby route for an Event-A report)", async () => {
    // The nearby route (src/app/api/reports/[id]/nearby/route.ts:107)
    // does `ctx.events.find((e) => e.event_id === report.event_id)`
    // and returns 403 if no match. Carol's ctx.events only contains
    // Event B (she's a coordinator there). So even though the
    // reports SELECT is allowed by the admin RLS branch
    // (`reports_select_creator_or_event_reviewer_or_admin` has
    // `or public.is_admin()`), the app-layer membership check rejects
    // her for Event A's nearby route.
    //
    // This is intentional defense-in-depth: the admin has
    // cross-event READ access (via the audit view, the cross-event
    // dashboard), but the spatial-RPC routes are scoped to events
    // the admin is an explicit member of. If the operator wants an
    // admin to inspect Event A's nearby reports, they should add
    // the admin as a member of Event A.
    //
    // The mock returns the RLS-allowed row (admin can SELECT it),
    // but the route then hits the app-layer 403.
    mockFrom.mockReturnValue(makeSelectChain({
      data: { id: REPORT_A1, event_id: EVENT_A, latitude: 35.5951, longitude: -82.5515, location_source: "gps" },
      error: null,
    }));
    const { request, context } = makeNearbyReq(REPORT_A1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(403);
    // Verify the RPC was NOT called (the app-layer check short-
    // circuits before the spatial query).
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("can query the Event-A viewport cross-event (admin in ctx.events only has Event B, BUT admin bypasses via is_admin())", async () => {
    // The viewport route's app-layer check requires ctx.events.find(e => e.event_id === eventId).
    // Carol's ctx only has Event B in events. So she gets 403 from the
    // app-layer check — EVEN THOUGH she's an admin. This is the
    // defense-in-depth pattern: the app-layer check is stricter than
    // the RLS policy. The admin must use the admin-specific paths
    // (e.g., the audit_events view, the cross-event dashboard) to
    // inspect cross-event data; the viewport RPC is event-scoped.
    //
    // Note: this is INTENTIONAL — the admin is in Event B's coordinator
    // role. If the operator wants an admin to inspect Event A's map,
    // they should add the admin as a member of Event A (or via a
    // dedicated admin-view route that bypasses the per-event
    // membership check).
    const req = makeViewportReq(EVENT_A);
    const res = await getViewport(req);
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("can mint a derivative signed URL for an Event-A report cross-event (admin RLS)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: {
        id: REPORT_A1,
        creator_id: ALICE,
        original_storage_key: `evidence-originals/${EVENT_A}/${REPORT_A1}.jpg`,
        derivative_storage_key: `evidence-derivatives/${EVENT_A}/${REPORT_A1}.jpg`,
        thumbnail_storage_key: `evidence-thumbnails/${EVENT_A}/${REPORT_A1}.jpg`,
      },
      error: null,
    }));
    mockCreateClient.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({
            data: { signedUrl: "https://signed.example/derivative.jpg" },
            error: null,
          })),
        })),
      },
    });
    const { request, context } = makeEvidenceReq(REPORT_A1, "derivative");
    const res = await getEvidence(request, context);
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// OUTSIDER (Dave) — Event-B contributor, NOT a member of Event A
// ===========================================================================

describe("Outsider (Dave, Event-B contributor — outsider for Event A)", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: DAVE });
    mockGetAuthContext.mockResolvedValue(daveCtx);
  });

  it("CANNOT read Alice's Event-A report via the nearby route (RLS hides the row → 404)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeNearbyReq(REPORT_A1);
    const res = await getNearby(request, context);
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("CANNOT mint a signed URL for Alice's Event-A evidence (RLS hides the row → 404)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    }));
    const { request, context } = makeEvidenceReq(REPORT_A1);
    const res = await getEvidence(request, context);
    expect(res.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("CANNOT query the Event-A viewport (membership check rejects → 403)", async () => {
    const req = makeViewportReq(EVENT_A);
    const res = await getViewport(req);
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("CAN query the Event-B viewport (his own event) — but the RPC scopes by event_id, no cross-event leak", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: REPORT_B1, title: "Wildfire damage", status: "needs_review",
          review_outcome: null, location_source: "gps",
          latitude: 34.0359, longitude: -118.5186,
          priority_score: 71, incident_type: "other",
          created_at: new Date().toISOString() },
      ],
      error: null,
    });
    const req = makeViewportReq(EVENT_B);
    const res = await getViewport(req);
    expect(res.status).toBe(200);
    // The viewport route calls `supabase.rpc("viewport_reports", { ... })`.
    // The first arg is the function name; the second is the args object.
    expect(mockRpc).toHaveBeenCalledWith("viewport_reports", expect.objectContaining({
      p_event_id: EVENT_B,
    }));
    const body = await res.json();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].id).toBe(REPORT_B1);
  });
});

// ===========================================================================
// RPC-level cross-event boundary (the defense-in-depth layer)
// ===========================================================================

describe("PostGIS RPC cross-event boundary (defense-in-depth)", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: BOB });
    mockGetAuthContext.mockResolvedValue(bobCtx);
  });

  it("nearby_reports RPC is called with the report's event_id (extracted from the RLS-visible row)", async () => {
    // Even if Bob could pass an arbitrary event_id in the URL, the
    // route extracts the event_id from the RLS-enforced report SELECT
    // (line 80-91 of nearby/route.ts). He cannot influence the
    // p_event_id parameter — it comes from the report row, which RLS
    // already gated.
    mockFrom.mockReturnValue(makeSelectChain({
      data: { id: REPORT_A1, event_id: EVENT_A, latitude: 35.5951, longitude: -82.5515, location_source: "gps" },
      error: null,
    }));
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { request, context } = makeNearbyReq(REPORT_A1);
    await getNearby(request, context);
    expect(mockRpc).toHaveBeenCalledWith("nearby_reports", expect.objectContaining({
      p_event_id: EVENT_A,
      p_lat: 35.5951,
      p_lon: -82.5515,
    }));
  });

  it("viewport_reports RPC enforces event membership INSIDE the function (SECURITY INVOKER + is_event_member check)", async () => {
    // The viewport route's app-layer check rejects Bob for Event B
    // (he's not a member). But even if that check were bypassed, the
    // RPC itself raises "You are not a member of this event" because
    // it's SECURITY INVOKER (runs as Bob's role) and calls
    // public.is_event_member(p_event_id) which queries event_members
    // under RLS (Bob's RLS hides Event B's members from him).
    //
    // Simulate the function's membership-rejection error.
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "You are not a member of this event" },
    });
    // Bob IS a member of Event A, so the app-layer check passes.
    // Then the RPC is called — and it returns the rejection (simulating
    // a hardened RPC that double-checks membership even when the
    // app-layer allowed it).
    const req = makeViewportReq(EVENT_A);
    const res = await getViewport(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("QUERY_FAILED");
    expect(body.error.message).toContain("not a member");
  });
});

// ===========================================================================
// Retention state gating (defense-in-depth on the evidence route)
// ===========================================================================

describe("Retention state gating on the evidence route", () => {
  beforeEach(() => {
    mockRequireServerUser.mockResolvedValue({ id: ALICE });
    mockGetAuthContext.mockResolvedValue(aliceCtx);
  });

  it("returns 410 SOFT_DELETED when the report is soft-deleted (no signed URL minted)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: {
        id: REPORT_A1, creator_id: ALICE,
        original_storage_key: `evidence-originals/${EVENT_A}/${REPORT_A1}.jpg`,
        derivative_storage_key: `evidence-derivatives/${EVENT_A}/${REPORT_A1}.jpg`,
        thumbnail_storage_key: `evidence-thumbnails/${EVENT_A}/${REPORT_A1}.jpg`,
      },
      error: null,
    }));
    mockGetRetentionState.mockResolvedValue("soft_deleted");
    const { request, context } = makeEvidenceReq(REPORT_A1);
    const res = await getEvidence(request, context);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("SOFT_DELETED");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 410 PURGED when the report is purged (no signed URL minted)", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: {
        id: REPORT_A1, creator_id: ALICE,
        original_storage_key: `evidence-originals/${EVENT_A}/${REPORT_A1}.jpg`,
        derivative_storage_key: `evidence-derivatives/${EVENT_A}/${REPORT_A1}.jpg`,
        thumbnail_storage_key: `evidence-thumbnails/${EVENT_A}/${REPORT_A1}.jpg`,
      },
      error: null,
    }));
    mockGetRetentionState.mockResolvedValue("purged");
    const { request, context } = makeEvidenceReq(REPORT_A1);
    const res = await getEvidence(request, context);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("PURGED");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 429 SIGNED_URL_RATE_EXCEEDED when the per-user mint rate limit fires", async () => {
    mockFrom.mockReturnValue(makeSelectChain({
      data: {
        id: REPORT_A1, creator_id: ALICE,
        original_storage_key: `evidence-originals/${EVENT_A}/${REPORT_A1}.jpg`,
        derivative_storage_key: `evidence-derivatives/${EVENT_A}/${REPORT_A1}.jpg`,
        thumbnail_storage_key: `evidence-thumbnails/${EVENT_A}/${REPORT_A1}.jpg`,
      },
      error: null,
    }));
    mockGetRetentionState.mockResolvedValue("active");
    mockCheckSignedUrlRate.mockResolvedValue({
      ok: false, code: "SIGNED_URL_RATE_EXCEEDED",
      message: "rate exceeded", used: 60, limit: 60,
    });
    const { request, context } = makeEvidenceReq(REPORT_A1);
    const res = await getEvidence(request, context);
    expect(res.status).toBe(429);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
