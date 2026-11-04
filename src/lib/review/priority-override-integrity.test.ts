import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261105001000_atomic_priority_override.sql", "utf8");
const api = readFileSync("src/app/api/reports/[id]/priority/route.ts", "utf8");

describe("atomic and role-scoped priority override", () => {
  it("has a single transactional RPC, report lock and idempotency", () => {
    expect(sql).toContain("submit_priority_override_atomic");
    expect(sql).toContain("for update");
    expect(sql).toContain("request_id");
    expect(sql).toContain("is_event_coordinator_or_admin");
    expect(sql).toContain("v_report.retention_state <> 'active'");
    expect(sql).toContain("revoke all on function");
    expect(sql).toContain("to authenticated;");
  });
  it("does not use a fragile history insert followed by a separate report update in Next.js", () => {
    expect(api).toContain('supabase.rpc("submit_priority_override_atomic"');
    expect(api).not.toContain('.from("priority_overrides")\n    .insert(');
    expect(api).not.toContain('set status: "reviewed"');
  });
});
