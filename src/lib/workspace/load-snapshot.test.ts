// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserEventMembership } from "@/lib/auth/profile";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), from: vi.fn(), cookie: vi.fn(),
  select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));

import { loadIncidentWorkspaceSnapshot } from "./load-snapshot";

const uuid = (value: number) => `a1b2c3d4-e5f6-4789-8abc-${value.toString(16).padStart(12, "0")}`;
const membership = (name: string, slug = name): UserEventMembership => ({
  event_id: name, event_name: `${name} event`, event_slug: slug,
  event_status: "active", role: "contributor",
});
const community = membership("community", "community-intake");
const ctx = { events: [membership("first"), community, membership("selected")] };
function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: "analysis-a", model_id: "demo-mock-v1", processing_status: "succeeded",
    created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:01:00Z",
    structured_observation: { incident_type: "flooding", preliminary_severity: 3, summary_en: "Demonstration observation." },
    ...overrides,
  };
}
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(1), title: "Submitted road report", description: null,
    status: "needs_review", review_outcome: null, retention_state: "active",
    location_source: "manual", location_label: null, latitude: 14.6, longitude: 121,
    uploaded_at: "2026-11-04T08:00:00+08:00", captured_at: null,
    priority_score: 40, report_analyses: analysis(), ...overrides,
  };
}
function result(data: unknown = [row()], count: number | null = 1) {
  mocks.range.mockResolvedValue({ data, count, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T03:00:00Z"));
  const query = { select: mocks.select, eq: mocks.eq, or: mocks.or, order: mocks.order, range: mocks.range };
  for (const method of [mocks.select, mocks.eq, mocks.or, mocks.order]) method.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.cookie.mockReturnValue(undefined);
  result();
});
afterEach(() => vi.useRealTimers());

describe("authorized event snapshot", () => {
  it("honors a cookie only when it matches a real membership", async () => {
    mocks.cookie.mockReturnValue({ value: "selected" });
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot.eventId).toBe("selected");
    expect(mocks.cookie).toHaveBeenCalledWith("tr-active-event");
    expect(mocks.eq).toHaveBeenCalledWith("event_id", "selected");
    expect(snapshot.fetchedAt).toBe("2026-11-04T03:00:00.000Z");
  });
  it("ignores an unauthorized cookie and uses the community membership", async () => {
    mocks.cookie.mockReturnValue({ value: "not-a-member" });
    expect((await loadIncidentWorkspaceSnapshot(ctx)).eventId).toBe("community");
    expect(mocks.eq).not.toHaveBeenCalledWith("event_id", "not-a-member");
  });
  it("falls back to the first real membership without inventing an event", async () => {
    expect((await loadIncidentWorkspaceSnapshot({ events: [membership("first")] })).eventId).toBe("first");
    vi.clearAllMocks();
    mocks.cookie.mockReturnValue({ value: "selected" });
    const unavailable = await loadIncidentWorkspaceSnapshot({ events: [] });
    expect(unavailable).toMatchObject({ state: "unavailable", totalCount: null, reports: [], eventId: "" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("counts and loads the same active, non-rejected event scope with a stable 200-row cap", async () => {
    result(Array.from({ length: 200 }, (_, index) => row({ id: uuid(index + 1) })), 241);
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("reports");
    expect(mocks.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(mocks.eq.mock.calls).toEqual([["event_id", "community"], ["retention_state", "active"]]);
    expect(mocks.or).toHaveBeenCalledWith("review_outcome.is.null,review_outcome.neq.rejected");
    expect(mocks.order.mock.calls).toEqual([
      ["priority_score", { ascending: false, nullsFirst: false }],
      ["uploaded_at", { ascending: false }], ["id", { ascending: true }],
    ]);
    expect(mocks.range).toHaveBeenCalledWith(0, 199);
    expect(snapshot).toMatchObject({ state: "ready", totalCount: 241, windowLimited: true });
    expect(snapshot.reports).toHaveLength(200);
    expect(snapshot.message).toContain("200 loaded reports of 241");
  });
});

describe("empty, partial, and failed snapshot semantics", () => {
  it("represents a successful empty event as known zero", async () => {
    result([], 0);
    expect(await loadIncidentWorkspaceSnapshot(ctx)).toMatchObject({ state: "ready", totalCount: 0, reports: [], windowLimited: false });
  });
  it("never turns a query failure into a successful zero or exposes backend diagnostics", async () => {
    mocks.range.mockResolvedValue({ data: null, count: null, error: { message: "INTERNAL_DIAGNOSTIC" } });
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot).toMatchObject({ state: "unavailable", totalCount: null, reports: [] });
    expect(JSON.stringify(snapshot)).not.toContain("INTERNAL_DIAGNOSTIC");
  });
  it("handles a thrown transport error with the same neutral unavailable result", async () => {
    mocks.range.mockRejectedValue(new Error("INTERNAL_TRANSPORT"));
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot.state).toBe("unavailable");
    expect(snapshot.totalCount).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain("INTERNAL_TRANSPORT");
  });
  it("keeps usable reports partial when their total is unavailable", async () => {
    result([row()], null);
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot).toMatchObject({ state: "partial", totalCount: null });
    expect(snapshot.reports).toHaveLength(1);
  });
  it("rejects malformed records without claiming they were loaded", async () => {
    result([row(), row({ id: "../unsafe-path" }), row({ status: "reviewed", review_outcome: null }),
      row({ id: uuid(3), retention_state: "purged" })], 4);
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot.state).toBe("partial");
    expect(snapshot.reports).toHaveLength(1);
    expect(snapshot.message).toContain("Some report records are unavailable");
  });
});

describe("neutral persisted observation projection", () => {
  it("uses the latest succeeded analysis regardless of embedded array order", async () => {
    const older = analysis();
    const newer = analysis({ id: "analysis-b", model_id: "newer-model", updated_at: "2026-11-04T01:00:00Z",
      structured_observation: { incident_type: "blocked_road", summary_en: "Actual newer saved observation.", preliminary_severity: 2, arbitrary_field: "not projected" } });
    result([row({ report_analyses: [older, newer] })]);
    const first = (await loadIncidentWorkspaceSnapshot(ctx)).reports[0];
    result([row({ report_analyses: [newer, older] })]);
    const second = (await loadIncidentWorkspaceSnapshot(ctx)).reports[0];
    expect(first).toEqual(second);
    expect(first).toMatchObject({ incident_type: "blocked_road", summary: "Actual newer saved observation.", severity: 2, model_id: "newer-model" });
    expect(first).not.toHaveProperty("arbitrary_field");
  });
  it("does not substitute an older successful observation for a failed newest run", async () => {
    result([row({ report_analyses: [analysis(), analysis({ id: "analysis-b", updated_at: "2026-11-04T02:00:00Z", processing_status: "failed" })] })]);
    expect((await loadIncidentWorkspaceSnapshot(ctx)).reports[0]).toMatchObject({ incident_type: null, summary: null, severity: null, model_id: null });
  });
  it("does not invent locations, dates, titles, priority, or severity from malformed optional fields", async () => {
    result([row({ title: "  ", description: { unexpected: true }, location_source: "unknown", latitude: 14.6, longitude: 121,
      uploaded_at: "invalid", captured_at: "invalid", priority_score: NaN,
      report_analyses: analysis({ structured_observation: { incident_type: [], summary_en: {}, preliminary_severity: 2.5 } }) })]);
    expect((await loadIncidentWorkspaceSnapshot(ctx)).reports[0]).toMatchObject({
      title: null, description: null, latitude: null, longitude: null,
      uploaded_at: "", captured_at: null, priority_score: null, incident_type: null, summary: null, severity: null,
    });
  });
  it("keeps valid unlocated reports in the queue and normalizes actual timestamps", async () => {
    result([row({ location_source: "unknown", latitude: null, longitude: null })]);
    const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
    expect(snapshot.state).toBe("ready");
    expect(snapshot.reports[0]).toMatchObject({ location_source: "unknown", latitude: null, longitude: null, uploaded_at: "2026-11-04T00:00:00.000Z" });
  });
  it("uses a stable ID tie-breaker for equally timed analysis records", async () => {
    const a = analysis({ id: "analysis-a", model_id: "a" });
    const b = analysis({ id: "analysis-b", model_id: "b" });
    result([row({ report_analyses: [b, a] })]);
    expect((await loadIncidentWorkspaceSnapshot(ctx)).reports[0].model_id).toBe("a");
  });
});
