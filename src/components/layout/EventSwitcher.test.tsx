import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { EventSwitcher } from "./EventSwitcher";

const events = [
  { event_id: "11111111-1111-4111-8111-111111111111", event_name: "Typhoon response", role: "reviewer", event_status: "active" },
  { event_id: "22222222-2222-4222-8222-222222222222", event_name: "Flood response", role: "contributor", event_status: "active" },
] as Parameters<typeof EventSwitcher>[0]["events"];

beforeEach(() => {
  router.refresh.mockClear();
  document.cookie = "tr-active-event=11111111-1111-4111-8111-111111111111; path=/";
});
afterEach(() => cleanup());

describe("event switcher accessibility and scoping", () => {
  it("refreshes server-rendered content after selecting a different event", () => {
    const onSelect = vi.fn();
    render(<EventSwitcher events={events} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch active event" }));
    fireEvent.click(screen.getByRole("button", { name: /Flood response/ }));
    expect(onSelect).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("tr-active-event=22222222-2222-4222-8222-222222222222");
    expect(screen.queryByRole("group", { name: "Select active event" })).toBeNull();
  });

  it("dismisses on Escape without changing the chosen event", () => {
    render(<EventSwitcher events={events} />);
    const trigger = screen.getByRole("button", { name: "Switch active event" });
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Select active event" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Select active event" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
