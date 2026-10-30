// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  user: vi.fn(),
  context: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: mocks.configured }));
vi.mock("@/lib/supabase/server", () => ({
  requireServerUser: mocks.user,
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/auth/profile", () => ({ getAuthContext: mocks.context }));

import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
function call(payload: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/reports/${ID}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.user.mockResolvedValue({ id: USER_ID });
  mocks.context.mockResolvedValue({ user: { id: USER_ID, role: "reviewer" } });
  mocks.rpc.mockResolvedValue({
    data: { ok: true, reportId: ID, newStatus: "reviewed", reviewOutcome: "confirmed" },
    error: null,
  });
});

describe("atomic review route integration", () => {
  it("requires real Supabase and an authenticated reviewer", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await call({ action: "confirm" })).status).toBe(503);
    mocks.configured.mockReturnValue(true);
    mocks.user.mockRejectedValue(new Error("expired"));
    expect((await call({ action: "confirm" })).status).toBe(401);
    mocks.user.mockResolvedValue({ id: USER_ID });
    mocks.context.mockResolvedValue({ user: { id: USER_ID, role: "reporter" } });
    expect((await call({ action: "confirm" })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps corrected fields into the restricted atomic transaction with stable request ID", async () => {
    const res = await call({
      action: "correct",
      requestId: REQUEST_ID,
      reason: "Bridge approach has debris visible",
      correctedIncidentType: "debris",
      correctedSeverity: 4,
      correctedSummary: "Visible debris blocks the road.",
      correctedVisibleEvidence: ["Concrete fragments on road surface"],
    });
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("submit_review_atomic", {
      p_report_id: ID,
      p_request_id: REQUEST_ID,
      p_action: "correct",
      p_comment: null,
      p_reason: "Bridge approach has debris visible",
      p_corrections: {
        incident_type: "debris",
        preliminary_severity: 4,
        summary_en: "Visible debris blocks the road.",
        visible_evidence: ["Concrete fragments on road surface"],
      },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects correction missing its reason or changed fields before DB calls", async () => {
    expect((await call({ action: "correct", correctedSeverity: 4 })).status).toBe(400);
    expect((await call({ action: "correct", reason: "because" })).status).toBe(400);
    expect((await call({ action: "confirm", correctedSeverity: 4 })).status).toBe(400);
    expect((await call({ action: "reject" })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on missing migration, never leaks provider SQL error text", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: {
      code: "42883", message: "function public.submit_review_atomic(...) does not exist and contains secret metadata"
    } });
    const res = await call({ action: "confirm", requestId: REQUEST_ID });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toMatch(/migration is pending/);
    expect(JSON.stringify(body)).not.toContain("secret metadata");
  });

  it("maps explicit SQL denials to client-safe conflict and access responses", async () => {
    for (const [code, status] of [["42501", 403], ["22023", 400], ["P0001", 409], ["P0002", 404]] as const) {
      mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "internal protected DB state" } });
      const response = await call({ action: "confirm", requestId: REQUEST_ID });
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("internal protected DB state");
    }
  });
});
