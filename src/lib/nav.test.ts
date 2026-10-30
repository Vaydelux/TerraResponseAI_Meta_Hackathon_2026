import { describe, it, expect } from "vitest";
import { NAV_ITEMS, navForRole, defaultViewForRole, toNavRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

describe("NAV_ITEMS role gating", () => {
  it("every role can see Dashboard, Upload, Map, Profile", () => {
    for (const role of ["REPORTER", "REVIEWER", "ADMIN"] as Role[]) {
      const ids = navForRole(role).map((i) => i.id);
      expect(ids).toContain("dashboard");
      expect(ids).toContain("upload");
      expect(ids).toContain("map");
      expect(ids).toContain("profile");
    }
  });

  it("REPORTER cannot see Review Queue or Audit Log", () => {
    const ids = navForRole("REPORTER").map((i) => i.id);
    expect(ids).not.toContain("review");
    expect(ids).not.toContain("audit");
  });

  it("REVIEWER can see Review Queue and Audit Log", () => {
    const ids = navForRole("REVIEWER").map((i) => i.id);
    expect(ids).toContain("review");
    expect(ids).toContain("audit");
  });

  it("ADMIN sees all seven views", () => {
    expect(navForRole("ADMIN").map((i) => i.id).sort()).toEqual(
      ["audit", "dashboard", "map", "profile", "reports", "review", "upload"].sort(),
    );
  });

  it("every role can see the Reports nav item", () => {
    for (const role of ["REPORTER", "REVIEWER", "ADMIN"] as Role[]) {
      expect(navForRole(role).map((i) => i.id)).toContain("reports");
    }
  });

  it("every nav item has a non-empty href beginning with /", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href.length).toBeGreaterThan(1);
    }
  });

  it("NAV_ITEMS is non-empty and every item declares at least one role", () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of NAV_ITEMS) {
      expect(item.roles.length).toBeGreaterThan(0);
    }
  });
});

describe("defaultViewForRole", () => {
  it("returns a role-permitted view", () => {
    for (const role of ["REPORTER", "REVIEWER", "ADMIN"] as Role[]) {
      const def = defaultViewForRole(role);
      const allowed = navForRole(role).map((i) => i.id);
      expect(allowed).toContain(def);
    }
  });
});

describe("toNavRole (Supabase lowercase bridge)", () => {
  it("maps lowercase Supabase roles to uppercase nav roles", () => {
    expect(toNavRole("admin")).toBe("ADMIN");
    expect(toNavRole("reviewer")).toBe("REVIEWER");
    expect(toNavRole("reporter")).toBe("REPORTER");
  });
  it("defaults unknown strings to REPORTER", () => {
    expect(toNavRole("unknown")).toBe("REPORTER");
    expect(toNavRole("")).toBe("REPORTER");
  });
});
