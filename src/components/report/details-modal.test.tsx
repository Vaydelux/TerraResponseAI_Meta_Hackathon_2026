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
  it("renders actual report evidence, provisional severity and human-review provenance without fake dispatch", () => {
    render(
      <DetailsModal
        report={mockReport}
        open={true}
        onOpenChange={() => {}}
        canReview={true}
      />
    );

    expect(screen.getByText("Flash Flooding along C-5 Corridor")).toBeDefined();
    expect(screen.getByText("4/5")).toBeDefined();
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/14\.6219° N, 121\.0856° E/i)).toBeDefined();
    expect(screen.getByText("AI generated, not verified")).toBeDefined();
    expect(screen.getByText("Provisional severity")).toBeDefined();
    expect(screen.getByText("Submitted description")).toBeDefined();
    expect(screen.getByText("Responder Elena")).toBeDefined();
    expect(screen.getByRole("link", { name: /Open full report/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Open review workbench/i })).toBeDefined();
    expect(screen.queryByText("MMDA Road Ops")).toBeNull();
    expect(screen.queryByText("SAM 3.1 Mask")).toBeNull();
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

