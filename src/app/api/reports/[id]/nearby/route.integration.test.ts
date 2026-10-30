// @vitest-environment node
//
// src/app/api/reports/[id]/nearby/route.integration.test.ts
//
// Integration tests for the nearby-reports API route.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockFrom, mockRpc, mockRequireServerUser, mockGetAuthContext, mockIsSupabaseConfigured } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRequireServerUser: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockIsSupabaseConfigured: vi.fn(() => true),
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
}));

import { GET } from "@/app/api/reports/[id]/nearby/route";
import { NextRequest } from "next/server";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(): { request: NextRequest; context: { params: Promise<{ id: string }> } } {
  const request = new NextRequest(`http://localhost/api/reports/${REPORT_ID}/nearby?radius=1000`, {
    method: "GET",
  });
  return { request, context: { params: Promise.resolve({ id: REPORT_ID }) } };
}

function makeThenable(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const eqMock = vi.fn(() => chain);
  const maybeSingleMock = vi.fn(() => promise);
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    select: vi.fn(() => chain),
    eq: eqMock,
    maybeSingle: maybeSingleMock,
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);
  mockRequireServerUser.mockResolvedValue({ id: USER_ID });
  mockGetAuthContext.mockResolvedValue({
    user: { id: USER_ID, role: "reviewer", email: "test@terra.ai", name: "Test" },
    events: [{ event_id: EVENT_ID, role: "reviewer" }],
    activeEventId: EVENT_ID,
  });
  mockRpc.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/reports/[id]/nearby (mocked integration)", () => {
  it("returns 503 NOT_CONFIGURED when Supabase is not configured", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  it("returns 401 UNAUTHORIZED when the session is expired", async () => {
    mockRequireServerUser.mockRejectedValue(new Error("no session"));
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 NOT_FOUND when the report doesn't exist", async () => {
    mockFrom.mockReturnValue(makeThenable({ data: null, error: { code: "PGRST116" } }));
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with empty reports when the report has unknown location", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: {
        id: REPORT_ID, event_id: EVENT_ID,
        latitude: null, longitude: null, location_source: "unknown",
      },
      error: null,
    }));
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reports).toEqual([]);
    expect(body.message).toContain("no known location");
  });

  it("returns 403 FORBIDDEN when the user is not a member of the report's event", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: {
        id: REPORT_ID, event_id: "other-event-id",
        latitude: 35.5, longitude: -82.5, location_source: "gps",
      },
      error: null,
    }));
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 200 with nearby reports on success", async () => {
    mockFrom.mockReturnValue(makeThenable({
      data: {
        id: REPORT_ID, event_id: EVENT_ID,
        latitude: 35.5951, longitude: -82.5515, location_source: "gps",
      },
      error: null,
    }));
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "report-2", title: "Nearby flood",
          status: "needs_review", review_outcome: null,
          location_source: "gps", latitude: 35.5952, longitude: -82.5516,
          priority_score: 60, incident_type: "flooding",
          distance_meters: 50, created_at: new Date().toISOString(),
        },
        {
          id: REPORT_ID,
          title: "This report",
          status: "needs_review", review_outcome: null,
          location_source: "gps", latitude: 35.5951, longitude: -82.5515,
          priority_score: 62, incident_type: "flooding",
          distance_meters: 0, created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    const { request, context } = makeRequest();
    const res = await GET(request, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.provisional).toBe(true);
    expect(body.reports).toHaveLength(1); // the report itself is filtered out
    expect(body.reports[0].id).toBe("report-2");
    expect(body.reports[0].distance_meters).toBe(50);
  });
});
