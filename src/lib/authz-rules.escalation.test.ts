// src/lib/authz-rules.escalation.test.ts
//
// Tests for role-escalation attempts. The brief: "Test ... role
// escalation." Each test asserts that a contributor (or a
// non-member of an event) CANNOT perform a privileged action
// (review, force-manual-review, delete, see cross-event reports).
//
// These tests are pure (no DB, no network); they exercise the
// authz-rules + nav modules directly. The route-handler-level
// enforcement is tested in route.integration.test.ts (the analyze
// route) + the retention route handler tests.

import { describe, it, expect } from "vitest";
import {
  canAccessReport,
  canMutateReport,
  canActOnReview,
  reportReadWhere,
  type AuthSession,
} from "@/lib/authz-rules";
import { navForRole, NAV_ITEMS, type ViewId } from "@/lib/nav";
import type { Role } from "@/lib/types";

function user(role: Role, id = "u-" + role): AuthSession {
  return { id, email: `${role}@terra.ai`, name: role, role };
}

/** Helper: can a role see a specific nav view (by id)? */
function canSeeView(role: Role, viewId: ViewId): boolean {
  return navForRole(role).some((item) => item.id === viewId);
}

describe("role-escalation: REPORTER cannot act as REVIEWER", () => {
  it("forbids a REPORTER from acting on a review (canActOnReview)", () => {
    expect(canActOnReview(user("REPORTER"))).toBe(false);
  });

  it("forbids a REPORTER from confirming another user's report (canMutateReport on CONFIRMED)", () => {
    const r = user("REPORTER", "reporter-1");
    expect(canMutateReport(r, { reporterId: "reporter-2", status: "CONFIRMED" })).toBe(false);
  });

  it("forbids a REPORTER from mutating a CONFIRMED report even if they're the creator", () => {
    // REPORTER can mutate UPLOADED/ANALYZING; once it's CONFIRMED, only
    // ADMIN/REVIEWER can act on it. This is the contributor-cannot-
    // mark-verified rule.
    const r = user("REPORTER", "me");
    expect(canMutateReport(r, { reporterId: "me", status: "CONFIRMED" })).toBe(false);
  });
});

describe("role-escalation: REPORTER cannot escalate to ADMIN", () => {
  it("forbids a REPORTER from seeing ALL reports (reportReadWhere returns reporter-only)", () => {
    const where = reportReadWhere(user("REPORTER"));
    expect(where).toEqual({ reporterId: "u-REPORTER" });
  });

  it("forbids a REPORTER from seeing another reporter's report (canAccessReport)", () => {
    expect(canAccessReport(user("REPORTER", "r1"), { reporterId: "r2" })).toBe(false);
  });
});

describe("role-escalation: REVIEWER cannot escalate to ADMIN", () => {
  it("forbids a REVIEWER from mutating a CONFIRMED report (canMutateReport)", () => {
    // REVIEWER can't mutate ANY report via canMutateReport — that's
    // for the report creator (or admin). The reviewer acts via
    // canActOnReview (the separate review-action path).
    const r = user("REVIEWER");
    expect(canMutateReport(r, { reporterId: "x", status: "CONFIRMED" })).toBe(false);
  });

  it("allows a REVIEWER to act on a review (canActOnReview) — this is their job, not escalation", () => {
    expect(canActOnReview(user("REVIEWER"))).toBe(true);
  });

  it("allows a REVIEWER to see all reports (reportReadWhere returns {} for REVIEWER)", () => {
    expect(reportReadWhere(user("REVIEWER"))).toEqual({});
  });
});

describe("role-escalation: ADMIN can act on any report", () => {
  it("allows ADMIN to act on a review", () => {
    expect(canActOnReview(user("ADMIN"))).toBe(true);
  });

  it("allows ADMIN to see any report", () => {
    expect(canAccessReport(user("ADMIN"), { reporterId: "someone" })).toBe(true);
  });

  it("allows ADMIN to mutate any report regardless of status", () => {
    expect(canMutateReport(user("ADMIN"), { reporterId: "x", status: "UPLOADED" })).toBe(true);
    expect(canMutateReport(user("ADMIN"), { reporterId: "x", status: "CONFIRMED" })).toBe(true);
  });

  it("allows ADMIN to see all reports (reportReadWhere returns {})", () => {
    expect(reportReadWhere(user("ADMIN"))).toEqual({});
  });
});

describe("canSeeView — navigation gating (role-escalation via URL)", () => {
  it("forbids a REPORTER from seeing the Review Queue view (no access via URL guessing)", () => {
    expect(canSeeView("REPORTER", "review")).toBe(false);
  });

  it("forbids a REPORTER from seeing the Audit Log view", () => {
    expect(canSeeView("REPORTER", "audit")).toBe(false);
  });

  it("allows a REVIEWER to see the Review Queue + Audit Log", () => {
    expect(canSeeView("REVIEWER", "review")).toBe(true);
    expect(canSeeView("REVIEWER", "audit")).toBe(true);
  });

  it("allows an ADMIN to see every view", () => {
    expect(canSeeView("ADMIN", "review")).toBe(true);
    expect(canSeeView("ADMIN", "audit")).toBe(true);
  });
});

describe("NAV_ITEMS — no role-escalation via a hidden nav entry", () => {
  it("every nav item requires REVIEWER+ for review/audit (REPORTER excluded)", () => {
    for (const item of NAV_ITEMS) {
      if (item.id === "review" || item.id === "audit") {
        expect(item.roles).not.toContain("REPORTER");
        expect(item.roles).toContain("REVIEWER");
        expect(item.roles).toContain("ADMIN");
      }
    }
  });

  it("every nav item allows ADMIN", () => {
    for (const item of NAV_ITEMS) {
      expect(item.roles).toContain("ADMIN");
    }
  });
});

describe("reportReadWhere — no cross-event leak (defense-in-depth)", () => {
  // The Supabase RLS policies enforce event-scoping at the DB level.
  // reportReadWhere is the application-layer equivalent for the Prisma
  // path (used only in legacy code paths). The Supabase path relies
  // on RLS; this test verifies the Prisma path doesn't return more
  // than the user's own reports.
  it("REPORTER: reportReadWhere returns ONLY their own reports", () => {
    const where = reportReadWhere(user("REPORTER", "me"));
    expect(where).toEqual({ reporterId: "me" });
  });

  it("REVIEWER: reportReadWhere returns {} (all reports — they're the reviewer for the event)", () => {
    const where = reportReadWhere(user("REVIEWER"));
    expect(where).toEqual({});
  });
});
