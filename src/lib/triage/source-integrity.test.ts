import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const incidents = readFileSync("src/app/(app)/incidents/page.tsx", "utf8");
const notifications = readFileSync("src/app/(app)/notifications/page.tsx", "utf8");
const costDashboard = readFileSync("src/components/admin/SpendCeilings.tsx", "utf8");

describe("truthful field intelligence presentation", () => {
  it("does not invent flooding, geographic corridors or model proximity matches when incident data is absent", () => {
    expect(incidents).toContain('const category = typeof rawCategory === "string"');
    expect(incidents).toContain('"unclassified"');
    expect(incidents).toContain("No proximity or recency inference");
    expect(incidents).toContain("not a proximity match");
    expect(incidents).not.toContain('?? "flooding"');
    expect(incidents).not.toContain('"Metro Manila Sector"');
    expect(incidents).not.toContain('"Sector Corridor"');
    expect(incidents).not.toContain("1.5 km · 6h");
  });

  it("never equates derived report activity with persisted unread notifications", () => {
    expect(notifications).toContain("const totalNotifications: number | null = error ? null :");
    expect(notifications).toContain("const unreadCount: number | null = error ? null :");
    expect(notifications).toContain("Recent report activity · not notifications");
    expect(notifications).toContain("Read-only entries derived from authorized stored reports.");
    expect(notifications).not.toContain("derivedUpdates.length;");
    expect(notifications).toContain("The persisted notifications inbox is unavailable");
  });

  it("does not misrepresent global AI spend as a per-user or per-event measurement", () => {
    expect(costDashboard).toContain("Global daily recorded estimate");
    expect(costDashboard).toContain("Per-user and per-event spend: unavailable");
    expect(costDashboard).toContain("AI usage is unavailable");
    expect(costDashboard).not.toContain('label="Per user"');
    expect(costDashboard).not.toContain('label="Per event"');
  });
});
