import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/report/ReportThumb", () => ({ ReportThumb: () => <span>Thumbnail</span> }));
vi.mock("@/components/report/SeverityMeter", () => ({ SeverityMeter: () => <span>Severity</span> }));
vi.mock("@/components/seal/SealBadge", () => ({ SealBadge: () => <span>Seal</span> }));
vi.mock("@/components/ui-tr", () => ({
  SkeletonRow: () => <div>Loading report</div>,
  EmptyState: ({ title, description, action }: {title: string; description: string; action?: React.ReactNode}) =>
    <div role="status"><h3>{title}</h3><p>{description}</p>{action}</div>,
  Button: ({ children, onClick }: {children: React.ReactNode; onClick: () => void}) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));

import { ReviewQueueTable } from "./ReviewQueueTable";
const report = {
  id: "a1111111-1111-4111-8111-111111111111",
  status: "needs_review", title: "Damaged bridge", description: null,
  review_outcome: null, priority_score: 55, uploaded_at: "2026-10-30T00:00:00Z",
  latitude: null, longitude: null, location_source: "unknown", location_label: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("review queue resilience and keyboard access", () => {
  it("shows a recoverable error, not an empty queue, when one required API request fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, reports: [report] }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { code: "SERVICE_UNAVAILABLE" } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, reports: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewQueueTable eventId="b2222222-2222-4222-8222-222222222222" />);
    expect(await screen.findByText("Could not load the queue")).toBeTruthy();
    expect(screen.queryByText("No reports waiting")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading queue" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(await screen.findByText("No reports waiting")).toBeTruthy();
  });

  it("leaves native Enter on buttons and links alone while retaining optional J/K navigation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, reports: [report] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, reports: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewQueueTable eventId="b2222222-2222-4222-8222-222222222222" />);
    const link = await screen.findByRole("link", { name: "Damaged bridge" });
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "j" });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(link.getAttribute("href")).toBe("/review/" + report.id);
  });

  it("does not show a successful empty queue for invalid API payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, reports: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewQueueTable eventId="b2222222-2222-4222-8222-222222222222" />);
    expect(await screen.findByText("Could not load the queue")).toBeTruthy();
  });
});
