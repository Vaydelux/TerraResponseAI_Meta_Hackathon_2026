import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const topbar=readFileSync("src/components/layout/TopBar.tsx","utf8");
const shell=readFileSync("src/components/layout/AppShell.tsx","utf8");
const layout=readFileSync("src/app/(app)/layout.tsx","utf8");
const review=readFileSync("src/app/api/reports/[id]/review/route.ts","utf8");
const processing=readFileSync("src/lib/triage/processing.ts","utf8");

describe("role-scoped notification UI and reviewer transactions", () => {
  it("shows navigation only in feature-enabled environments", () => {
    expect(layout).toContain("showIncidentNotifications={isTriageEnabled()}");
    expect(shell).toContain("showIncidentNotifications={showIncidentNotifications}");
    expect(topbar).toContain("showIncidentNotifications &&");
    expect(topbar).toContain('href="/notifications"');
  });
  it("notifies after the verified atomic review succeeds", () => {
    expect(processing).toContain("export async function notifyReviewCompleted");
    expect(processing).toContain('kind: "review_completed"');
    const rpcPos=review.indexOf('supabase.rpc("submit_review_atomic"');
    const notifyPos=review.indexOf("await notifyReviewCompleted");
    expect(rpcPos).toBeGreaterThan(0);
    expect(notifyPos).toBeGreaterThan(rpcPos);
    expect(review.slice(rpcPos,notifyPos)).toContain("if (error)");
    expect(review.slice(rpcPos,notifyPos)).toContain("!data");
  });
  it("never sends reviewer reason or original private evidence to the inbox", () => {
    const start=processing.indexOf("export async function notifyReviewCompleted");
    const end=processing.indexOf("/** Notifications are durable",start);
    const section=processing.slice(start,end);
    expect(section).not.toContain("body.reason");
    expect(section).not.toContain("original_storage_key");
    expect(section).toContain("Unrecognized review action");
  });
});
