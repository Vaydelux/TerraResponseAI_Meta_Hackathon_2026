import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql=readFileSync("supabase/migrations/20261103141000_alert_lifecycle_and_notification_uniqueness.sql","utf8");
const api=readFileSync("src/app/api/alerts/critical/route.ts","utf8");
const processor=readFileSync("src/lib/triage/processing.ts","utf8");

describe("critical alert lifecycle and private event delivery", () => {
  it("updates verification/publication inside the human review transaction", () => {
    expect(sql).toContain("after update of status,review_outcome on public.reports");
    expect(sql).toContain("new.status='reviewed'");
    expect(sql).toContain("t.publication_status='public_provisional'");
    expect(sql).toContain("'public_verified'");
    expect(sql).toContain("'private'");
    expect(sql).toContain("new.review_outcome='rejected'");
    expect(sql).toContain("security invoker");
  });
  it("ensures concurrent workers cannot duplicate the same recipient/report notification", () => {
    expect(sql).toContain("notifications_report_kind_once");
    expect(sql).toContain("on public.notifications(recipient_id,report_id,kind)");
    expect(processor).toContain('onConflict: "recipient_id,report_id,kind", ignoreDuplicates: true');
  });
  it("restricts the alert feed to verified sessions and a staging opt-in flag", () => {
    expect(api).toContain("await requireServerUser()");
    expect(api).toContain('REPORT_FIRST_CRITICAL_PUBLICATION_ENABLED !== "true"');
    expect(api).toContain('REPORT_FIRST_TRIAGE_ENABLED !== "true"');
    expect(api).toContain('process.env.DEMO_MODE === "true"');
    expect(api).toContain('"private, no-store, max-age=0"');
    expect(api).toContain('.eq("publication_status", "public_provisional")');
    expect(api).toContain('.eq("verification_status", "awaiting_human")');
    expect(api).toContain('.eq("status", "needs_review")');
    expect(api).toContain('Math.round(Number(r.latitude) * 100) / 100');
    expect(api).not.toContain("original_storage_key");
    expect(api).not.toContain("derivative_storage_key");
    expect(api).not.toContain("thumbnail_storage_key");
    expect(api).not.toContain("creator_id");
    expect(api).not.toContain('select("*")');
  });
});
