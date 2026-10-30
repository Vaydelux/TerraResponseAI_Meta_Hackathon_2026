// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  ctx: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireServerUser: mocks.user,
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/profile", () => ({ getAuthContext: mocks.ctx }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));

import { GET } from "./route";
const EVENT = "22222222-2222-4222-8222-222222222222";
function req(q: string) {
  return new NextRequest("http://localhost/api/reports/viewport?event_id=" + EVENT + "&" + q);
}
const valid = "sw_lat=10&sw_lon=119&ne_lat=19&ne_lon=123";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user1" });
  mocks.ctx.mockResolvedValue({ events: [{ event_id: EVENT }], user: { id: "user1", role: "reviewer" } });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe("geospatial viewport authorization and bounds", () => {
  it("rejects missing bounds rather than silently accepting zero", async () => {
    const res = await GET(req("sw_lat=10&ne_lat=19&ne_lon=123"));
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects noninteger, NaN, negative and oversized limits", async () => {
    for (const lim of ["NaN","0","2.5","501","-5"]) {
      const res = await GET(req(valid + "&limit=" + lim));
      expect(res.status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks event membership before calling PostGIS", async () => {
    mocks.ctx.mockResolvedValue({ events: [], user: { id: "user1" } });
    const res = await GET(req(valid));
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not return internal PostGIS errors to the client", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "internal_db_credentials" } });
    const res = await GET(req(valid));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain("internal_db_credentials");
  });
  it("makes a bounded event-scoped query for valid coordinates", async () => {
    const res = await GET(req(valid));
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("viewport_reports", expect.objectContaining({
      p_event_id: EVENT, p_limit: 200, p_sw_lat: 10, p_ne_lon: 123,
    }));
  });
});
