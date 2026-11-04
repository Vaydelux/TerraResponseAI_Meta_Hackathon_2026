import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardCommandWorkspace, classifyHazard } from "./DashboardCommandWorkspace";
import type { IncidentWorkspaceSnapshot, WorkspaceReport } from "@/lib/workspace/incidents";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/map/DeferredGeoCanvas", () => ({
  DeferredGeoCanvas: ({ reports, selectedId, onSelectReport }: {
    reports: WorkspaceReport[]; selectedId: string | null; onSelectReport: (id: string) => void;
  }) => <section aria-label="Test map">{reports.filter((report) => report.location_source !== "unknown" && typeof report.latitude === "number" && typeof report.longitude === "number").map((report) => (
    <button key={report.id} type="button" aria-pressed={selectedId === report.id} onClick={() => onSelectReport(report.id)}>Map pin: {report.title}</button>
  ))}</section>,
}));
vi.mock("./ReportThumb", () => ({ ReportThumb: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));

afterEach(() => { cleanup(); refresh.mockClear(); });

const reports: WorkspaceReport[] = [
  { id: "flood-1", status: "needs_review", review_outcome: null, title: "Flood on Taft Avenue", description: "Water across the road", location_label: "Taft Avenue", incident_type: "flooding", severity: 5, latitude: 14.58, longitude: 120.98, location_source: "manual", uploaded_at: "2026-11-04T08:00:00Z", priority_score: 80 },
  { id: "fire-2", status: "needs_review", review_outcome: null, title: "Transformer fire", description: "Visible smoke", incident_type: "fire", severity: 4, latitude: 14.59, longitude: 120.99, location_source: "manual", uploaded_at: "2026-11-04T08:10:00Z", priority_score: 90 },
  { id: "unknown-3", status: "uploaded", review_outcome: null, title: "Unlocated field report", description: null, incident_type: null, severity: null, latitude: 14.6, longitude: 121, location_source: "unknown", uploaded_at: "2026-11-04T08:20:00Z", priority_score: null },
];

function snapshot(overrides: Partial<IncidentWorkspaceSnapshot> = {}): IncidentWorkspaceSnapshot {
  return { eventId: "event-a", eventName: "Authorized event", reports, totalCount: 7, fetchedAt: "2026-11-04T08:25:00Z", state: "ready", ...overrides };
}
const queue = () => within(screen.getByRole("region", { name: "Priority queue" }));
const details = () => within(screen.getByRole("region", { name: "Selected incident details" }));
const pins = () => within(screen.getByRole("region", { name: "Pinned reports" }));
const map = () => within(screen.getByRole("region", { name: "Test map" }));

describe("shared hazard classification", () => {
  it("keeps explicit flooding at severity five and leaves unknown reports unclassified", () => {
    expect(classifyHazard(reports[0])).toBe("flood");
    expect(classifyHazard(reports[1])).toBe("hazmat");
    expect(classifyHazard({ ...reports[2], title: "Flood? Rescue? Smoke?", severity: 5 })).toBe("other");
  });
});

describe("linked command workspace", () => {
  it("scopes counts and synchronizes hazard/search filters across map and queue", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    expect(screen.getByText("3 loaded of 7 in this event")).toBeDefined();
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(3);
    expect(map().getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /^Fire & Hazmat/ }));
    expect(queue().getByRole("button", { name: "Select Transformer fire" })).toBeDefined();
    expect(queue().queryByRole("button", { name: "Select Flood on Taft Avenue" })).toBeNull();
    expect(map().getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^All hazards/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search incidents" }), { target: { value: "taft" } });
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(1);
    expect(map().getByRole("button", { name: "Map pin: Flood on Taft Avenue" })).toBeDefined();
  });

  it("selects the same detail from map or queue and clears it when time excludes it", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    fireEvent.click(map().getByRole("button", { name: "Map pin: Transformer fire" }));
    expect(details().getByRole("heading", { name: "Transformer fire" })).toBeDefined();
    expect(queue().getByRole("button", { name: "Select Transformer fire" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: "Filter reports by upload time" }), { target: { value: "25" } });
    expect(details().queryByRole("heading", { name: "Transformer fire" })).toBeNull();
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(1);
    fireEvent.click(queue().getByRole("button", { name: "Select Flood on Taft Avenue" }));
    expect(details().getByRole("heading", { name: "Flood on Taft Avenue" })).toBeDefined();
    expect(map().getByRole("button", { name: "Map pin: Flood on Taft Avenue" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("announces selected incidents and can clear selection without changing filters", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    fireEvent.click(queue().getByRole("button", { name: "Select Transformer fire" }));
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Selected incident");
    expect(details().getByRole("heading", { name: "Transformer fire" })).toBeDefined();
    fireEvent.click(details().getByRole("button", { name: "Clear selected incident" }));
    expect(details().queryByRole("heading", { name: "Transformer fire" })).toBeNull();
    expect(screen.getByRole("button", { name: /^All hazards/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not present pending uploads or manual-only review as completed AI inference", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot({
      reports: [reports[2], { ...reports[0], status: "needs_manual_review", model_id: null }],
      totalCount: 2,
    })} canReview />);
    expect(queue().getByText("Awaiting AI analysis")).toBeDefined();
    expect(queue().getByText("Human review pending · no AI finding")).toBeDefined();
  });

  it("keeps unlocated reports in the queue without creating a map pin or coordinates", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot()} canReview={false} />);
    expect(map().queryByRole("button", { name: /Unlocated/ })).toBeNull();
    fireEvent.click(queue().getByRole("button", { name: "Select Unlocated field report" }));
    expect(details().getByText("Location unavailable")).toBeDefined();
    expect(details().getByText("Not assessed")).toBeDefined();
    expect(details().getByText("Unscored")).toBeDefined();
    expect(details().queryByRole("button", { name: "Copy coordinates" })).toBeNull();
    expect(details().queryByRole("link", { name: /review workbench/i })).toBeNull();
  });

  it("pins a real shortlist and selecting an excluded pin resets hazard/search/time", () => {
    render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    fireEvent.click(queue().getByRole("button", { name: "Pin Flood on Taft Avenue" }));
    fireEvent.click(screen.getByRole("button", { name: /^Fire & Hazmat/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search incidents" }), { target: { value: "transformer" } });
    fireEvent.change(screen.getByRole("slider", { name: "Filter reports by upload time" }), { target: { value: "75" } });
    expect(pins().getByText("Outside current filters · select to show")).toBeDefined();
    fireEvent.click(pins().getByRole("button", { name: "Select Flood on Taft Avenue" }));
    expect(screen.getByRole("searchbox").getAttribute("value")).toBe("");
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("100");
    expect(screen.getByRole("button", { name: /^All hazards/ }).getAttribute("aria-pressed")).toBe("true");
    expect(details().getByRole("heading", { name: "Flood on Taft Avenue" })).toBeDefined();
    fireEvent.click(pins().getByRole("button", { name: "Unpin Flood on Taft Avenue" }));
    expect(pins().queryByRole("button", { name: "Select Flood on Taft Avenue" })).toBeNull();
  });

  it("prunes removed selections and pinned IDs after a successful refresh", () => {
    const { rerender } = render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    fireEvent.click(queue().getByRole("button", { name: "Select Flood on Taft Avenue" }));
    fireEvent.click(details().getByRole("button", { name: "Pin report" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<DashboardCommandWorkspace snapshot={snapshot({ reports: [reports[1]], totalCount: 1, fetchedAt: "2026-11-04T08:30:00Z" })} canReview />);
    expect(pins().queryByRole("button", { name: /^Select / })).toBeNull();
    expect(details().queryByRole("heading", { name: "Flood on Taft Avenue" })).toBeNull();
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(1);
    expect(screen.getByText("1 loaded of 1 in this event")).toBeDefined();
  });

  it("preserves the previous same-event snapshot only with an explicit stale warning", () => {
    const { rerender } = render(<DashboardCommandWorkspace snapshot={snapshot()} canReview />);
    fireEvent.click(queue().getByRole("button", { name: "Pin Flood on Taft Avenue" }));
    rerender(<DashboardCommandWorkspace snapshot={snapshot({ state: "unavailable", reports: [], totalCount: null, message: "Request failed" })} canReview />);
    expect(screen.getByRole("alert").textContent).toContain("Refresh failed · showing an older snapshot");
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(3);
    expect(pins().getByRole("button", { name: "Select Flood on Taft Avenue" })).toBeDefined();
    expect(screen.getByText("3 loaded of 7 in this event")).toBeDefined();
  });

  it("uses the event-keyed boundary to reset filters and local pins on event switch", () => {
    const { rerender } = render(<DashboardCommandWorkspace key="event-a" snapshot={snapshot()} canReview />);
    fireEvent.click(queue().getByRole("button", { name: "Pin Flood on Taft Avenue" }));
    fireEvent.click(screen.getByRole("button", { name: /^Flood/ }));
    rerender(<DashboardCommandWorkspace key="event-b" snapshot={snapshot({ eventId: "event-b", reports: [reports[1]] })} canReview />);
    expect(pins().queryByRole("button", { name: /^Select / })).toBeNull();
    expect(screen.getByRole("button", { name: /^All hazards/ }).getAttribute("aria-pressed")).toBe("true");
    expect(queue().getByRole("button", { name: "Select Transformer fire" })).toBeDefined();
  });

  it("distinguishes filtered empty, genuine empty, and unavailable snapshots", () => {
    const { rerender } = render(<DashboardCommandWorkspace snapshot={snapshot()} canReview={false} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-match-for-this-event" } });
    expect(screen.getByRole("heading", { name: "No incidents match these filters" })).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Reset filters" })[0]);
    expect(queue().getAllByRole("button", { name: /^Select / })).toHaveLength(3);
    rerender(<DashboardCommandWorkspace key="empty" snapshot={snapshot({ reports: [], totalCount: 0 })} canReview={false} />);
    expect(screen.getByRole("heading", { name: "No reports in this event yet" })).toBeDefined();
    rerender(<DashboardCommandWorkspace key="unavailable" snapshot={snapshot({ reports: [], totalCount: null, state: "unavailable" })} canReview={false} />);
    expect(screen.getByRole("heading", { name: "Reports could not be loaded" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Workspace data unavailable");
  });
});
