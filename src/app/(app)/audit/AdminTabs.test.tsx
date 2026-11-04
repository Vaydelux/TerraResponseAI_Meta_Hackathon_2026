// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminTabs } from "./AdminTabs";
afterEach(cleanup);

describe("admin governance tabs", () => {
  it("uses tab semantics, switches on click and supports arrow, Home and End", () => {
    render(<AdminTabs audit={<div>Audit records</div>} events={<div>Active events</div>} spend={<div>Real usage</div>} />);
    const audit = screen.getByRole("tab", { name: "Audit log" });
    const events = screen.getByRole("tab", { name: "Events" });
    const spend = screen.getByRole("tab", { name: "AI spend ceilings" });
    expect(audit.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Audit records");
    fireEvent.keyDown(audit, { key: "ArrowRight" });
    expect(events.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Active events");
    fireEvent.keyDown(events, { key: "End" });
    expect(spend.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(spend, { key: "Home" });
    expect(audit.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(spend);
    expect(screen.getByRole("tabpanel").textContent).toContain("Real usage");
  });
});
