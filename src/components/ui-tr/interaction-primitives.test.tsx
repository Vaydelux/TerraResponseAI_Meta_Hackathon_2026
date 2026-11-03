import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Popover } from "./Popover";
import { ToastRegion, toast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("shared interaction primitives", () => {
  it("closes a popover on Escape and restores focus to its trigger", () => {
    render(
      <Popover trigger="Account" aria-label="Account menu">
        <button type="button">Profile</button>
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Account menu" }).getAttribute("aria-modal")).toBe("false");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Account menu" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("auto-dismisses toast errors and supports immediate dismissal", () => {
    vi.useFakeTimers();
    render(<ToastRegion />);

    act(() => toast.error("Request failed"));
    expect(screen.getByRole("alert").textContent).toContain("Request failed");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => toast.error("Second failure"));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
