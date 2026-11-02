import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20261103120000_report_first_triage_and_threads.sql","utf8");
const intake=readFileSync("src/lib/community/intake.ts","utf8");
const upload=readFileSync("src/app/api/reports/route.ts","utf8");
const page=readFileSync("src/app/(app)/reports/new/page.tsx","utf8");
const analyze=readFileSync("src/app/api/reports/[id]/analyze/route.ts","utf8");
const triage=readFileSync("src/lib/triage/processing.ts","utf8");

describe("report-first workflow security and compatibility", () => {
  it("keeps the existing production flow behind explicit rollout gates", () => {
    expect(intake).toContain('process.env.REPORT_FIRST_INTAKE_ENABLED === "true"');
    expect(triage).toContain('process.env.REPORT_FIRST_TRIAGE_ENABLED === "true"');
    expect(upload).toContain("if (isCommunityIntakeEnabled())");
    expect(page).toContain("if (isCommunityIntakeEnabled())");
  });
  it("only enrolls in one server-selected intake, never in client-selected private events", () => {
    expect(intake).toContain('COMMUNITY_INTAKE_SLUG = "community-intake"');
    expect(intake).toContain("ignoreDuplicates: true");
    expect(intake).toContain('onConflict: "event_id,user_id"');
    expect(upload).toContain("communityEventId === eventId");
    expect(upload).toContain("ctx.events.find");
    expect(upload).not.toContain("ensureCommunityIntakeMembership(meta.eventId)");
  });
  it("uses RLS and never grants anonymous access to incident evidence or alerts", () => {
    for (const table of ["report_triage", "incident_threads", "incident_report_links", "notifications"]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.report_triage");
    expect(migration).not.toMatch(/grant\s+(?:select|all)\s+on\s+public\.notifications\s+to\s+anon/i);
    expect(migration).toContain("recipient_id=(select auth.uid())");
    expect(migration).toContain("to service_role");
  });
  it("never marks an AI classification verified or makes it public", () => {
    expect(migration).toContain("publication_status text not null default 'private'");
    expect(migration).toContain("verification_status text not null default 'awaiting_human'");
    expect(triage).toContain("confirmed_match: false");
    expect(triage).toContain('assignment_method: distanceM !== null ? "suggested" : "automatic"');
    expect(triage).toContain("find_community_incident_candidates");
    expect(triage).toContain("notifyRecipients");
  });
  it("can retry triage after analysis and cache hits without re-calling Meta", () => {
    expect(analyze).toContain("if (isTriageEnabled())");
    expect(analyze).toContain("processReportTriage");
    expect(analyze).toContain('code: "TRIAGE_PENDING"');
  });
});
