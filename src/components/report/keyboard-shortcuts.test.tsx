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

describe("MapPreview (.map-panel) zoom controls & hover", () => {
  it("renders .map-panel with terra-card-hover and Material 3 44x44px zoom controls", () => {
    const { container } = render(<MapPreview />);

    const mapPanel = container.querySelector(".map-panel.terra-card-hover");
    expect(mapPanel).not.toBeNull();

    const zoomGroup = screen.getByRole("group", { name: /Map zoom controls/i });
    expect(zoomGroup).toBeDefined();

    const zoomInBtn = screen.getByRole("button", { name: /Zoom in map preview/i });
    const zoomOutBtn = screen.getByRole("button", { name: /Zoom out map preview/i });

    expect(zoomInBtn.className).toContain("min-w-[44px]");
    expect(zoomInBtn.className).toContain("min-h-[44px]");
    expect(zoomOutBtn.className).toContain("min-w-[44px]");
    expect(zoomOutBtn.className).toContain("min-h-[44px]");

    // Click zoom in -> should update zoom percentage indicator to 120%
    fireEvent.click(zoomInBtn);
    expect(screen.getByText("120%")).toBeDefined();
  });
});
