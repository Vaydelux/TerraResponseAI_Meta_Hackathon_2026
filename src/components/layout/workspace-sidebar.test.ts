import { describe, expect, it } from "vitest";
import { getWorkspaceNavSections } from "./WorkspaceSidebar";

function routes(role: "reporter" | "reviewer" | "admin", triage = false, roles = false): string[] {
  return getWorkspaceNavSections({
    role,
    showIncidentNotifications: triage,
    showRoleManagement: roles,
  }).flatMap((section) => section.links.map((link) => link.href));
}

describe("role-aware workspace sidebar navigation", () => {
  it("provides safe primary navigation for all account roles", () => {
    for (const role of ["reporter", "reviewer", "admin"] as const) {
      expect(routes(role)).toEqual(expect.arrayContaining([
        "/dashboard", "/map", "/reports/new", "/reports",
      ]));
    }
  });

  it("does not reveal reviewer, audit, or privileged role-management links to reporters", () => {
    const reporter = routes("reporter", true, true);
    expect(reporter).not.toContain("/review");
    expect(reporter).not.toContain("/audit");
    expect(reporter).not.toContain("/admin/users");
  });

  it("reveals reviewer routes only to authorized role labels", () => {
    const reviewer = routes("reviewer");
    expect(reviewer).toEqual(expect.arrayContaining(["/review", "/audit"]));
    expect(reviewer).not.toContain("/admin/users");
    expect(routes("admin", false, true)).toContain("/admin/users");
    expect(routes("admin", false, false)).not.toContain("/admin/users");
  });

  it("keeps incident threads and notifications behind the triage feature flag", () => {
    for (const role of ["reporter", "reviewer", "admin"] as const) {
      expect(routes(role, false)).not.toContain("/incidents");
      expect(routes(role, false)).not.toContain("/notifications");
      expect(routes(role, true)).toEqual(expect.arrayContaining(["/incidents", "/notifications"]));
    }
  });

  it("never creates a navigation section with no visible links", () => {
    for (const role of ["reporter", "reviewer", "admin"] as const) {
      expect(getWorkspaceNavSections({
        role,
        showIncidentNotifications: false,
        showRoleManagement: false,
      }).every((section) => section.links.length > 0)).toBe(true);
    }
  });
});
