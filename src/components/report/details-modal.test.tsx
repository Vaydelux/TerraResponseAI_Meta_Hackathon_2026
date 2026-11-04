import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailsModal } from "./DetailsModal";
import { IncidentTriageCard } from "./IncidentTriageCard";
import { ThemeProvider, useTheme } from "@/components/terra/providers";
import type { ReportRowData } from "./ReportRow";

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

  if (typeof globalThis !== "undefined" && !globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const mockReport: ReportRowData = {
  id: "d9e8f7a6-1234-4567-8901-abcdef123456",
  status: "needs_review",
  review_outcome: null,
  title: "Flash Flooding along C-5 Corridor",
  description: "Roadway submerged by 1.2m storm surge. Commuters stranded.",
  latitude: 14.6219,
  longitude: 121.0856,
  location_source: "exif",
  location_label: "Pasig City · C-5 Overpass",
  uploaded_at: "2026-11-04T08:00:00Z",
  priority_score: 85,
  incident_type: "flooding",
  severity: 4,
  audit_trail: [
    {
      id: "aud-1",
      action: "report_created",
      created_at: "2026-11-04T08:00:00Z",
      actor_name: "Responder Elena",
      details: "Uploaded C-5 flood photo with EXIF coordinates",
    },
    {
      id: "aud-2",
      action: "ai_triage_completed",
      created_at: "2026-11-04T08:02:00Z",
      actor_name: "Muse Spark + SAM 3.1",
      details: "Classified SEV 4 flooding with 94.2% segmentation mask",
    },
  ],
};

function TestThemeConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <span data-testid="resolved-val">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
    </div>
  );
}

describe("DetailsModal component", () => {
  it("renders incident details, horizontal Recharts audit status timeline, SAM 3.1 overlay toggle, and agency dispatch SOP when open", () => {
    render(
      <DetailsModal
        report={mockReport}
        open={true}
        onOpenChange={() => {}}
        canReview={true}
      />
    );

    // Title & Severity
    expect(screen.getByText("Flash Flooding along C-5 Corridor")).toBeDefined();
    expect(screen.getByText(/SEV 4 · High Priority/i)).toBeDefined();

    // Priority Score & Location
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/14.6219° N, 121.0856° E/i)).toBeDefined();

    // Recharts Horizontal Audit Trail & Status Progression Timeline
    expect(screen.getByTestId("incident-status-timeline-chart")).toBeDefined();
    expect(
      screen.getByText(/Audit Trail & Incident Status Progression Timeline/i)
    ).toBeDefined();
    expect(screen.getByText(/1\. Creation/i)).toBeDefined();
    expect(screen.getByText(/2\. Triage/i)).toBeDefined();
    expect(screen.getByText(/3\. Needs Review/i)).toBeDefined();
    expect(screen.getByText(/4\. Confirmation/i)).toBeDefined();
    expect(screen.getByText("needs_review")).toBeDefined();
    expect(screen.getByText("Responder Elena")).toBeDefined();

    // SAM 3.1 Mask Control
    expect(screen.getByText(/SAM 3.1 Mask/i)).toBeDefined();

    // Agency Dispatch
    expect(screen.getByText("MMDA Road Ops")).toBeDefined();
    expect(screen.getByText("Coast Guard Rescue")).toBeDefined();
    expect(screen.getByText("Red Cross Triage")).toBeDefined();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <DetailsModal
        report={mockReport}
        open={false}
        onOpenChange={() => {}}
      />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("IncidentTriageCard full-bleed thumbnail", () => {
  it("renders ReportThumb with triage-card__thumb w-full h-full object-cover class so the photo fills the 16:10 frame", () => {
    const { container } = render(<IncidentTriageCard report={mockReport} />);
    const thumb = container.querySelector(".triage-card__media .triage-card__thumb");
    expect(thumb).not.toBeNull();
    expect(thumb?.className).toContain("w-full");
    expect(thumb?.className).toContain("h-full");
    expect(thumb?.className).toContain("object-cover");
  });
});

describe("ThemeProvider in providers.tsx", () => {
  it("integrates with shadcn/ui and provides system, light, and dark toggle", () => {
    render(
      <ThemeProvider defaultTheme="system">
        <TestThemeConsumer />
      </ThemeProvider>
    );

    const themeVal = screen.getByTestId("theme-val");
    expect(["system", "light", "dark"]).toContain(themeVal.textContent);
  });

  it("injects cross-fade animation style into document head", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <div>Content</div>
      </ThemeProvider>
    );
    const styleEl = document.getElementById("tr-theme-crossfade-style");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("tr-theme-crossfade");
    expect(styleEl?.textContent).toContain("cubic-bezier(0.2, 0, 0, 1)");
    expect(styleEl?.textContent).toContain("350ms");
    expect(styleEl?.textContent).toContain("tr-m3-fade-in");
  });
});

