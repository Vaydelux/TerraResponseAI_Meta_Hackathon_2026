import { describe, expect, it } from "vitest";
import {
  isNavHrefActive,
  resolveDefaultLocationChoice,
  canNavigateToWizardStep,
  buildNonLinearStepperItems,
  deriveClientMetaAiPreTriage,
  deriveAiTelemetrySnapshot,
} from "./upload-ux-helpers";

describe("upload UX and AI Telemetry helpers", () => {
  it("prevents /reports from highlighting when on /reports/new", () => {
    expect(isNavHrefActive("/reports/new", "/reports")).toBe(false);
    expect(isNavHrefActive("/reports/new", "/reports/new")).toBe(true);
    expect(isNavHrefActive("/reports", "/reports")).toBe(true);
    expect(isNavHrefActive("/reports/abc-123", "/reports")).toBe(true);
    expect(isNavHrefActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavHrefActive("/map", "/map")).toBe(true);
  });

  it("defaults to manual when photo has no EXIF GPS", () => {
    expect(resolveDefaultLocationChoice(null)).toBe("manual");
    expect(resolveDefaultLocationChoice(undefined)).toBe("manual");
    expect(resolveDefaultLocationChoice({ lat: 14.5995, lon: 120.9842 })).toBe("gps");
    expect(resolveDefaultLocationChoice({ lat: 190, lon: 120.9842 })).toBe("manual");
  });

  it("allows non-linear navigation across completed steps when not uploading", () => {
    expect(canNavigateToWizardStep(1, 2, true, false, false)).toBe(true);
    expect(canNavigateToWizardStep(1, 3, true, true, false)).toBe(true);
    expect(canNavigateToWizardStep(2, 1, false, false, false)).toBe(false);
    expect(canNavigateToWizardStep(2, 1, true, false, false)).toBe(true);
    // When on Step 1 after having confirmed location in Step 2, Step 3 remains directly reachable
    expect(canNavigateToWizardStep(3, 1, true, true, false)).toBe(true);
    expect(canNavigateToWizardStep(1, 3, true, true, true)).toBe(false);
  });

  it("marks completed steps as clickable in buildNonLinearStepperItems even when user navigates back to Step 1", () => {
    const itemsAtStep1AfterStep2Done = buildNonLinearStepperItems({
      currentStep: 1,
      hasValidFile: true,
      hasConfirmedLocation: true,
      isUploading: false,
      isSubmitted: false,
    });

    expect(itemsAtStep1AfterStep2Done[0]?.state).toBe("current");
    expect(itemsAtStep1AfterStep2Done[0]?.completed).toBe(true);
    expect(itemsAtStep1AfterStep2Done[1]?.state).toBe("completed");
    expect(itemsAtStep1AfterStep2Done[1]?.completed).toBe(true);
    expect(itemsAtStep1AfterStep2Done[1]?.reachable).toBe(true);
    expect(itemsAtStep1AfterStep2Done[1]?.ariaLabel).toMatch(/Completed — click to review or edit/);
    expect(itemsAtStep1AfterStep2Done[2]?.reachable).toBe(true);
  });

  it("does not classify or invent confidence before a real server response", () => {
    const hint = deriveClientMetaAiPreTriage({
      fileName: "critical_flood_10m_water.jpg",
      fileSize: 500_000,
      mimeType: "image/jpeg",
      hasExifGps: false,
      titleHint: "Emergency rescue immediately",
    });
    expect(hint.confidencePct).toBeNull();
    expect(hint.preliminarySeverity).toBeNull();
    expect(hint.incidentType).toBe("other");
    expect(hint.detectedTags).toEqual([]);
    expect(hint.suggestedDescription).toBe("");
    expect(hint.suggestedTitle).toBe("");
    expect(hint.modelId).not.toMatch(/Llama|Muse/i);
  });

  it("shows only local file state and location before inference", () => {
    const hint = deriveClientMetaAiPreTriage({
      fileName: "fire_blast.jpg", fileSize: 300_000,
      mimeType: "image/jpeg", hasExifGps: true,
    });
    for (const status of ["idle", "requesting", "processing", "unavailable"] as const) {
      const state = deriveAiTelemetrySnapshot({
        hasFile: true, isScanningClient: false,
        preTriage: hint, locationChoice: "manual", uploadProgress: null,
        serverStatus: status,
      });
      expect(state.confidencePct).toBeNull();
      expect(state.preliminarySeverity).toBeNull();
      expect(state.hazardLabels).not.toContain("Fire");
      expect(state.modelId).toContain("Awaiting");
    }
  });

  it("only renders real model evidence after a saved server response", () => {
    const preTriage = deriveClientMetaAiPreTriage({
      fileName: "random.png", fileSize: 320_000,
      mimeType: "image/png", hasExifGps: false,
    });
    const state = deriveAiTelemetrySnapshot({
      hasFile: true, isScanningClient: false,
      preTriage, locationChoice: "unknown", uploadProgress: null,
      serverStatus: "review_ready",
      serverTelemetry: {
        modelId: "muse-spark-1.3",
        incidentType: "flooding",
        preliminarySeverity: 4,
        visibleEvidence: ["Standing water covers the road"],
        uncertainties: ["Depth cannot be inferred"],
        latencyMs: 640,
      },
    });
    expect(state.phase).toBe("complete");
    expect(state.modelId).toBe("muse-spark-1.3");
    expect(state.preliminarySeverity).toBe(4);
    expect(state.hazardLabels).toContain("Standing water covers the road");
    expect(state.confidencePct).toBeNull();
    expect(state.latencyMs).toBe(640);
  });

});

