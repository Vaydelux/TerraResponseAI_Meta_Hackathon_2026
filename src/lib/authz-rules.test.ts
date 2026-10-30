import { describe, it, expect } from "vitest";
import {
  canAccessReport,
  canMutateReport,
  canActOnReview,
  reportReadWhere,
  type AuthSession,
} from "@/lib/authz-rules";
import type { Role } from "@/lib/types";

function user(role: Role, id = "u-" + role): AuthSession {
  return { id, email: `${role}@terra.ai`, name: role, role };
}

describe("canAccessReport", () => {
  it("allows ADMIN to see any report", () => {
    expect(canAccessReport(user("ADMIN"), { reporterId: "someone-else" })).toBe(true);
  });
  it("allows REVIEWER to see any report", () => {
    expect(canAccessReport(user("REVIEWER"), { reporterId: "someone-else" })).toBe(true);
  });
  it("allows REPORTER to see their own report", () => {
    const u = user("REPORTER", "me");
    expect(canAccessReport(u, { reporterId: "me" })).toBe(true);
  });
  it("forbids REPORTER from seeing another reporter's report", () => {
    expect(canAccessReport(user("REPORTER", "me"), { reporterId: "someone-else" })).toBe(false);
  });
});

describe("canMutateReport", () => {
  it("allows ADMIN to mutate any report regardless of status", () => {
    expect(canMutateReport(user("ADMIN"), { reporterId: "x", status: "CONFIRMED" })).toBe(true);
    expect(canMutateReport(user("ADMIN"), { reporterId: "x", status: "UPLOADED" })).toBe(true);
  });
  it("allows REPORTER to mutate own UPLOADED report", () => {
    const u = user("REPORTER", "me");
    expect(canMutateReport(u, { reporterId: "me", status: "UPLOADED" })).toBe(true);
    expect(canMutateReport(u, { reporterId: "me", status: "ANALYZING" })).toBe(true);
  });
  it("forbids REPORTER from mutating a report already in review", () => {
    const u = user("REPORTER", "me");
    expect(canMutateReport(u, { reporterId: "me", status: "IN_REVIEW" })).toBe(false);
    expect(canMutateReport(u, { reporterId: "me", status: "CONFIRMED" })).toBe(false);
  });
  it("forbids REPORTER from mutating another reporter's report", () => {
    expect(
      canMutateReport(user("REPORTER", "me"), { reporterId: "other", status: "UPLOADED" }),
    ).toBe(false);
  });
  it("forbids REVIEWER from mutating report content (reviewers confirm/flag/reject, not edit)", () => {
    expect(
      canMutateReport(user("REVIEWER"), { reporterId: "x", status: "UPLOADED" }),
    ).toBe(false);
  });
});

describe("canActOnReview", () => {
  it("allows REVIEWER and ADMIN", () => {
    expect(canActOnReview(user("REVIEWER"))).toBe(true);
    expect(canActOnReview(user("ADMIN"))).toBe(true);
  });
  it("forbids REPORTER", () => {
    expect(canActOnReview(user("REPORTER"))).toBe(false);
  });
});

describe("reportReadWhere", () => {
  it("returns empty filter for ADMIN (sees all rows)", () => {
    expect(reportReadWhere(user("ADMIN"))).toEqual({});
  });
  it("returns empty filter for REVIEWER (sees all rows)", () => {
    expect(reportReadWhere(user("REVIEWER"))).toEqual({});
  });
  it("returns reporterId filter for REPORTER (own rows only)", () => {
    const u = user("REPORTER", "me");
    expect(reportReadWhere(u)).toEqual({ reporterId: "me" });
  });
});
