// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  serverClient: vi.fn(),
  retention: vi.fn(),
  rate: vi.fn(),
  signedUrl: vi.fn(),
  auditInsert: vi.fn(),
  configured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireServerUser: mocks.user,
  createSupabaseServerClient: mocks.serverClient,
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.configured,
  supabaseUrl: () => "https://example.supabase.co",
  serviceRoleKey: () => "test-key",
}));
vi.mock("@/lib/storage/retention", () => ({
  getRetentionState: mocks.retention,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkSignedUrlRate: mocks.rate,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.signedUrl }) } }),
}));

import { GET } from "./route";

const id = "11111111-1111-4111-8111-111111111111";

function request(kind = "derivative") {
  return GET(new NextRequest(`http://localhost/api/reports/${id}/evidence?kind=${kind}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.user.mockResolvedValue({ id: "user-1" });
  mocks.retention.mockResolvedValue("active");
  mocks.rate.mockResolvedValue({ ok: true });
  mocks.signedUrl.mockResolvedValue({ data: { signedUrl: "https://private.example/signed" }, error: null });
  mocks.auditInsert.mockResolvedValue({ error: null });
  mocks.serverClient.mockResolvedValue({
    from: (table: string) => {
      if (table === "reports") return {
        select: () => ({ eq: () => ({
          maybeSingle: async () => ({
            data: {
              id,
              creator_id: "user-1",
              original_storage_key: "evidence-originals/x.jpg",
              derivative_storage_key: "evidence-derivatives/x.jpg",
              thumbnail_storage_key: "evidence-thumbnails/x.jpg",
            },
            error: null,
          }),
        }) }),
      };
      if (table === "evidence_signed_url_log") return { insert: mocks.auditInsert };
      throw new Error("Unexpected database table: " + table);
    },
  });
});

describe("private evidence access fails closed", () => {
  it("rejects unsupported evidence kinds", async () => {
    const res = await request("unexpected");
    expect(res.status).toBe(400);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("does not mint when retention state cannot be verified", async () => {
    mocks.retention.mockRejectedValue(new Error("Database unavailable"));
    const res = await request();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("RETENTION_UNAVAILABLE");
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("does not mint when evidence rate accounting is unavailable", async () => {
    mocks.rate.mockResolvedValue({
      ok: false, code: "SIGNED_URL_RATE_UNAVAILABLE", message: "Evidence unavailable", used: 0, limit: 60,
    });
    const res = await request();
    expect(res.status).toBe(503);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("does not return signed evidence when audit insert fails", async () => {
    mocks.auditInsert.mockResolvedValue({ error: { code: "42501" } });
    const res = await request();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AUDIT_UNAVAILABLE");
    expect(mocks.signedUrl).toHaveBeenCalledOnce();
    expect(mocks.auditInsert).toHaveBeenCalledOnce();
  });

  it("returns a short-lived URL only after successful audit", async () => {
    const res = await request();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signedUrl).toBe("https://private.example/signed");
    expect(body.expiresIn).toBe(60);
    expect(mocks.auditInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      report_id: id,
      kind: "derivative",
      ttl_seconds: 60,
    });
  });

  it("continues denying URLs for soft-deleted evidence", async () => {
    mocks.retention.mockResolvedValue("soft_deleted");
    const res = await request();
    expect(res.status).toBe(410);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });
});
