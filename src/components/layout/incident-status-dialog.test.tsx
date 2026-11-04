import { beforeAll, describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IncidentStatusDialog } from "./IncidentStatusDialog";

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

describe("IncidentStatusDialog component", () => {
  it("renders trigger button with Hazard Radar label and live indicator", () => {
    render(<IncidentStatusDialog />);
    const btn = screen.getByRole("button", { name: /Hazard Radar/i });
    expect(btn).toBeDefined();
  });

  it("opens modal and displays weather & seismic tabs and sector controls", async () => {
    render(<IncidentStatusDialog open={true} onOpenChange={() => {}} />);

    // Header title
    expect(screen.getByText(/Weather & Seismic Hazard Telemetry/i)).toBeDefined();

    // Tabs
    expect(screen.getByText(/Weather & Rain Radar/i)).toBeDefined();
    expect(screen.getByText(/Seismic & Fault Status/i)).toBeDefined();
    expect(screen.getByText(/Switch Sector/i)).toBeDefined();

    // Weather radar content by default
    expect(screen.getByText(/Precipitation/i)).toBeDefined();
    expect(screen.getByText(/Doppler Reflectivity/i)).toBeDefined();

    // Switch to Seismic Tab
    const seismicTab = screen.getByText(/Seismic & Fault Status/i);
    fireEvent.click(seismicTab);
    expect(screen.getByText(/PHIVOLCS West Valley Fault Line/i)).toBeDefined();
    expect(screen.getByText(/Fault Trace Distance/i)).toBeDefined();
  });
});
