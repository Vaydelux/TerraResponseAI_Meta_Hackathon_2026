import { beforeAll, describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardCommandWorkspace, classifyHazard } from "./DashboardCommandWorkspace";
import type { ReportRowData } from "./ReportRow";

beforeAll(() => {
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

const mockReports: ReportRowData[] = [
  {
    id: "rep-1",
    status: "needs_review",
    review_outcome: null,
    title: "Flooding on Taft Ave",
    description: "Deep water accumulation across all lanes.",
    incident_type: "flooding",
    severity: 3,
    latitude: 14.58,
    longitude: 120.98,
    uploaded_at: "2026-11-04T08:00:00Z",
  },
  {
    id: "rep-2",
    status: "needs_review",
    review_outcome: null,
    title: "Transformer Fire & Hazmat Fumes",
    description: "Electrical fire causing toxic smoke.",
    incident_type: "fire",
    severity: 4,
    latitude: 14.59,
    longitude: 120.99,
    uploaded_at: "2026-11-04T08:05:00Z",
  },
  {
    id: "rep-3",
    status: "needs_review",
    review_outcome: null,
    title: "Fallen Acacia Tree on Shaw Blvd",
    description: "Tree blocking roadway access.",
    incident_type: "blocked_road",
    severity: 2,
    latitude: 14.58,
    longitude: 121.05,
    uploaded_at: "2026-11-04T08:10:00Z",
  },
];

describe("classifyHazard helper", () => {
  it("classifies reports correctly into semantic hazard types", () => {
    expect(classifyHazard(mockReports[0])).toBe("flood");
    expect(classifyHazard(mockReports[1])).toBe("hazmat");
    expect(classifyHazard(mockReports[2])).toBe("road");
  });
});

describe("DashboardCommandWorkspace hazard filter bar", () => {
  it("renders the persistent horizontal pill filter bar with hazard categories and counts", () => {
    render(
      <DashboardCommandWorkspace
        reports={mockReports}
        streamItems={[]}
        canReview={true}
        totalReceived={3}
      />
    );

    const filterToolbar = screen.getByRole("toolbar", {
      name: /Filter active incident feeds by hazard type/i,
    });
    expect(filterToolbar).toBeDefined();

    // Check individual hazard pills
    expect(screen.getByText("All Hazards")).toBeDefined();
    expect(screen.getByText("Flood")).toBeDefined();
    expect(screen.getByText("Fire & Hazmat")).toBeDefined();
    expect(screen.getByText("Blocked Road")).toBeDefined();
    expect(screen.getByText("Medical & Rescue")).toBeDefined();
    expect(screen.getByText("Structural Damage")).toBeDefined();
    expect(screen.getByText("Debris Field")).toBeDefined();

    // Verify heading
    expect(screen.getByText("Active Incident Feeds")).toBeDefined();
  });

  it("filters feed items when clicking hazard pill tabs", () => {
    render(
      <DashboardCommandWorkspace
        reports={mockReports}
        streamItems={[]}
        canReview={true}
        totalReceived={3}
      />
    );

    // Initial state: all reports visible
    expect(screen.getByText("Flooding on Taft Ave")).toBeDefined();
    expect(screen.getByText("Transformer Fire & Hazmat Fumes")).toBeDefined();
    expect(screen.getByText("Fallen Acacia Tree on Shaw Blvd")).toBeDefined();

    // Click "Fire & Hazmat"
    const hazmatButton = screen.getByText("Fire & Hazmat").closest("button");
    expect(hazmatButton).not.toBeNull();
    fireEvent.click(hazmatButton!);

    // Only Hazmat should be shown
    expect(screen.getByText("Transformer Fire & Hazmat Fumes")).toBeDefined();
    expect(screen.queryByText("Flooding on Taft Ave")).toBeNull();
    expect(screen.queryByText("Fallen Acacia Tree on Shaw Blvd")).toBeNull();

    // Click "All Hazards" to reset
    const allButton = screen.getByText("All Hazards").closest("button");
    expect(allButton).not.toBeNull();
    fireEvent.click(allButton!);
    expect(screen.getByText("Flooding on Taft Ave")).toBeDefined();
  });
});
