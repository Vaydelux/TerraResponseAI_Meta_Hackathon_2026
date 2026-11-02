import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql=readFileSync("supabase/migrations/20261103140000_review_severity_and_publication_guards.sql","utf8");
const processor=readFileSync("src/lib/triage/processing.ts","utf8");
const reviewRoute=readFileSync("src/app/api/reports/[id]/review/route.ts","utf8");

describe("DB-enforced severity/verification security", () => {
  it("guards every review, including direct RPC and repeated corrections, at review_actions INSERT", () => {
    expect(sql).toContain("before insert on public.review_actions");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("new.reviewer_id is distinct from v_actor");
    expect(sql).toContain("v_role is distinct from 'reviewer'");
    expect(sql).toContain("v_role = 'admin'");
    expect(sql).toContain("'low_review','moderate_review','unrelated_review'");
    expect(sql).toContain("v_severity > 3");
    expect(sql).toContain("not found or v_class not in");
    expect(sql).toContain("raise exception 'High/critical or uncertain reports require an administrator'");
    expect(reviewRoute).toContain('supabase.rpc("submit_review_atomic"');
  });
  it("never turns a simulated, unrelated or unlocated observation into a published alert", () => {
    expect(sql).toContain("new.triage_class <> 'critical_provisional'");
    expect(sql).toContain("new.preliminary_severity is distinct from 5");
    expect(sql).toContain("new.verification_status <> 'awaiting_human'");
    expect(sql).toContain("v_report.location_source not in ('gps','manual')");
    expect(sql).toContain("v_report.latitude is null or v_report.longitude is null");
    expect(sql).toContain("v_report.review_outcome <> 'confirmed'");
    expect(processor).toContain('REPORT_FIRST_CRITICAL_PUBLICATION_ENABLED === "true"');
    expect(processor).toContain('process.env.DEMO_MODE !== "true"');
    expect(processor).toContain('/(?:demo|mock|stub|test)/i');
  });
  it("does not expose new RPCs to anonymous or authenticated callers", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.enforce_review_severity_boundary()");
    expect(sql).toContain("revoke all on function public.enforce_triage_publication_boundary()");
    expect(sql).not.toMatch(/grant\s+(?:select|all)\s+on\s+public\.reports\s+to\s+anon/i);
    expect(sql).not.toMatch(/disable row level security|drop table public\.review_actions/i);
  });
  it("routes elevated notifications only to admins", () => {
    // A retried model result cannot override the committed moderation priority.
    expect(processor).toContain('stored.priority === "high" ? "triage_completed"');
    expect(processor).toContain('stored.priority === "critical" ? "critical_provisional"');
    expect(processor).toContain('stored.verificationStatus === "awaiting_human"');
    expect(processor).toContain("readPersistedTriage(persisted)");
    expect(processor).toContain('if (args.kind === "review_required")');
  });
});
