// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
import { BackToTop } from "./BackToTop";

let reduceMotion = false;

function scrollToPosition(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  fireEvent.scroll(window);
}

beforeEach(() => {
  reduceMotion = false;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduceMotion && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("theme-aware global Back to top", () => {
  it("stays absent at the start of a page and appears after substantial scrolling", async () => {
    render(<><main id="main-content" tabIndex={-1}>Page content</main><BackToTop /></>);
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();

    scrollToPosition(850);
    const button = await screen.findByRole("button", { name: "Back to top" });
    expect(button.getAttribute("data-testid")).toBe("back-to-top");
    expect(button.className).toContain("bg-[var(--sheet)]");
    expect(button.className).toContain("min-h-12");

    scrollToPosition(0);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull());
  });

  it("returns smoothly and restores main-landmark focus", async () => {
    render(<><main id="main-content" tabIndex={-1}>Main</main><BackToTop /></>);
    scrollToPosition(850);
    const button = await screen.findByRole("button", { name: "Back to top" });
    fireEvent.click(button);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.activeElement).toBe(document.getElementById("main-content"));
  });

  it("uses instant native scrolling when reduced motion is requested", async () => {
    reduceMotion = true;
    render(<><main id="main-content" tabIndex={-1}>Main</main><BackToTop /></>);
    scrollToPosition(850);
    fireEvent.click(await screen.findByRole("button", { name: "Back to top" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
