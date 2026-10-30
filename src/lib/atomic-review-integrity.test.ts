import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0010_atomic_review_actions.sql", "utf8");
const route = readFileSync("src/app/api/reports/[id]/review/route.ts", "utf8");

describe("atomic review database guardrails", () => {
  it("runs the full decision and correction in one SQL function transaction", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.review_actions");
    expect(sql).toContain("update public.report_analyses");
    expect(sql).toContain("update public.reports");
    expect(route).toContain('supabase.rpc("submit_review_atomic"');
    expect(route).not.toContain('.from("review_actions").insert');
    expect(route).not.toContain('.from("reports").update');
  });
  it("does not blindly trust the service caller's asserted identity or event", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.is_event_reviewer_or_higher(v_report.event_id)");
    expect(sql).toContain("v_report.creator_id = v_actor");
    expect(sql).toContain("v_report.retention_state <> 'active'");
    expect(sql).toContain("v_report.status not in");
    expect(sql).toContain("p_request_id");
    expect(sql).toContain("review_actions_request_id_unique");
  });
  it("restricts executable permissions and prevents arbitrary field mutation", () => {
    expect(sql).toMatch(/revoke all on function public\.submit_review_atomic\(/);
    expect(sql).toMatch(/from public, anon/);
    expect(sql).toMatch(/to authenticated/);
    expect(sql).toContain("Correction field is not allowed");
    expect(sql).toContain("p_corrections ? 'incident_type'");
    expect(sql).toContain("p_corrections ? 'preliminary_severity'");
  });
});
