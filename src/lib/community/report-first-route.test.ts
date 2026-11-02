import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20261103143000_ensure_system_owned_community_intake.sql", "utf8");
const intake = readFileSync("src/lib/community/intake.ts", "utf8");
const app = readFileSync("src/app/(app)/layout.tsx", "utf8");
const upload = readFileSync("src/app/api/reports/route.ts", "utf8");
const list = readFileSync("src/components/report/ReportList.tsx", "utf8");
const review = readFileSync("src/components/review/ReviewQueueTable.tsx", "utf8");
const topbar = readFileSync("src/components/layout/TopBar.tsx", "utf8");
describe("global report-first intake and permissions", () => {
  it("creates only a fixed system-owned intake without fabricating an administrator", () => {
    expect(sql).toContain("created_by is not null or slug = 'community-intake'");
    expect(sql).toContain("on conflict (slug) do nothing");
    expect(sql).toContain("created_by");
    expect(sql).not.toMatch(/update public\.profiles\s+set\s+role/i);
  });
  it("enrolls a real authenticated identity, but never chooses an event from the browser", () => {
    expect(intake).toContain('COMMUNITY_INTAKE_SLUG = "community-intake"');
    expect(intake).toContain('ignoreDuplicates: true');
    expect(app).toContain("await ensureCommunityIntakeMembership(user.id)");
    expect(upload).toContain("meta.eventId !== eventId");
    expect(upload).not.toContain("const eventId = meta.eventId ??");
  });
  it("loads reports and moderation through RLS without an event-picker dependency", () => {
    expect(list).toContain('if (eventId) params.set("event_id", eventId)');
    expect(review).toContain('if (eventId) params.set("event_id", eventId)');
    expect(topbar).toContain('{ href: "/reports/new", label: "Upload Photo" }');
    expect(topbar).not.toContain("<EventSwitcher");
  });
});
