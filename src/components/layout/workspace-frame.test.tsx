// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Ref } from "react";
import type { AuthContext } from "@/lib/auth/profile";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./TopBar", () => ({
  TopBar: ({ mobileOpen, onToggleNavigation, menuToggleRef }: {
    mobileOpen?: boolean;
    onToggleNavigation: () => void;
    menuToggleRef: Ref<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      ref={menuToggleRef}
      aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={mobileOpen}
      onClick={onToggleNavigation}
    >
      Menu
    </button>
  ),
}));
vi.mock("./Wordmark", () => ({ Wordmark: () => <span>TerraResponse AI</span> }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => <span>Appearance control</span> }));
vi.mock("./WorkspaceSidebar", () => ({
  WorkspaceSidebar: ({ collapsed, isMobile, onToggleCollapse, onNavigate }: {
    collapsed?: boolean;
    isMobile?: boolean;
    onToggleCollapse?: () => void;
    onNavigate?: () => void;
  }) => (
    <div>
      <span>{isMobile ? "Mobile links" : collapsed ? "Compact links" : "Expanded links"}</span>
      {!isMobile && <button onClick={onToggleCollapse}>Toggle rail</button>}
      {isMobile && <button onClick={onNavigate}>Select route</button>}
    </div>
  ),
}));

import { WorkspaceFrame } from "./WorkspaceFrame";

const ctx: AuthContext = {
  user: { id: "reporter-1", email: "reporter@example.com", name: "Demo Reporter", role: "reporter" },
  events: [],
  activeEventId: null,
};

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("responsive workspace navigation shell", () => {
  it("keeps content mounted while expanding and collapsing the desktop rail", () => {
    render(<WorkspaceFrame ctx={ctx}><main>Incident command content</main></WorkspaceFrame>);
    const shell = screen.getByTestId("workspace-page-content");
    expect(shell.textContent).toContain("Incident command content");
    const grid = screen.getByTestId("desktop-workspace-sidebar").parentElement;
    expect(grid?.getAttribute("data-sidebar-collapsed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Toggle rail" }));
    expect(grid?.getAttribute("data-sidebar-collapsed")).toBe("true");
    expect(shell.textContent).toContain("Incident command content");
  });

  it("opens a modal drawer, closes with Escape, and restores menu focus", () => {
    render(<WorkspaceFrame ctx={ctx}><main>Dashboard</main></WorkspaceFrame>);
    const opener = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Workspace navigation" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("closes on backdrop click and route-link selection", () => {
    render(<WorkspaceFrame ctx={ctx}><main>Dashboard</main></WorkspaceFrame>);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close navigation overlay" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Select route" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
