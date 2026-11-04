import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcutsDock, KeyboardShortcutsDialog } from "./KeyboardShortcutsDock";
import { MapPreview } from "@/components/landing/MapPreview";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

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

describe("KeyboardShortcutsDock & KeyboardShortcutsDialog (Desktop/Laptop only)", () => {
  it("maps F1 to Incident Map, F2 to Review Queue, and F3 to New Upload and renders modal on toggle", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1440 });

    const { container } = render(<KeyboardShortcutsDock role="reviewer" pendingReviewCount={3} />);

    // Verify desktop-only class on dock
    const dock = container.querySelector(".shortcuts-dock");
    expect(dock).not.toBeNull();
    expect(dock?.className).toContain("hidden");
    expect(dock?.className).toContain("lg:flex");

    // Check F1, F2, F3 labels in bar
    expect(screen.getByText("Incident Map")).toBeDefined();
    expect(screen.getByText("Review Queue (3)")).toBeDefined();
    expect(screen.getByText("New Upload")).toBeDefined();

    // Open Keyboard Shortcuts modal
    const toggleBtn = screen.getByRole("button", { name: /Keyboard Shortcuts/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Dashboard & Workspace Actions \(F1–F4\)/i)).toBeDefined();

    // Test F1 -> /map, F2 -> /review, F3 -> /reports/new on desktop width
    fireEvent.keyDown(window, { key: "F1" });
    expect(pushMock).toHaveBeenCalledWith("/map");

    fireEvent.keyDown(window, { key: "F2" });
    expect(pushMock).toHaveBeenCalledWith("/review");

    fireEvent.keyDown(window, { key: "F3" });
    expect(pushMock).toHaveBeenCalledWith("/reports/new");
  });

  it("renders standalone KeyboardShortcutsDialog with shadcn/ui Dialog and desktop-only attributes", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1440 });
    render(<KeyboardShortcutsDialog role="admin" open={true} />);

    const dialog = document.getElementById("shortcuts-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("data-desktop-only")).toBe("true");
    expect(screen.getByText("Admin Shortcuts")).toBeDefined();
  });

  it("ignores F1-F4 keybindings on mobile viewports (< 1024px)", () => {
    pushMock.mockClear();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    render(<KeyboardShortcutsDock role="reviewer" />);
    fireEvent.keyDown(window, { key: "F1" });
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("Landing MapPreview accessible, honest sample interactions", () => {
  it("renders large keyboard-usable pins and keeps fiction visibly labeled", () => {
    const { container } = render(<MapPreview />);
    const illustration = screen.getByRole("group", { name: /Illustrative map, select a sample incident/i });
    expect(illustration).toBeDefined();
    const points = screen.getAllByRole("button", { name: /Select sample:/i });
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].className).toContain("size-12");
    expect(points[0].className).toContain("focus-visible:outline-2");
    fireEvent.click(points[1]);
    expect(points[1].getAttribute("aria-pressed")).toBe("true");
    const detail = container.querySelector("#preview-incident-detail");
    expect(detail?.textContent).toContain("Selected fictional report");
    expect(detail?.textContent).toContain("Unverified sample");
    expect(detail?.textContent).toContain("Still unknown");
    expect(screen.getByText(/fictional reports are an illustration/i)).toBeDefined();
  });
});
