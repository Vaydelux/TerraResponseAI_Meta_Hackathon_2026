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

  it("surfaces Meta AI Vision model and hazard tags in deriveClientMetaAiPreTriage", () => {
    const floodPreview = deriveClientMetaAiPreTriage({
      fileName: "baha.jpg",
      fileSize: 245_000,
      mimeType: "image/jpeg",
      hasExifGps: false,
      titleHint: "Baha sa Pasig",
    });
    expect(floodPreview.modelId).toBe("Llama-4-Maverick-17B-128E-Instruct-FP8");
    expect(floodPreview.incidentType).toBe("flooding");
    expect(floodPreview.preliminarySeverity).toBe(4);
    expect(floodPreview.detectedTags).toContain("Needs Pin Confirmation");

    const treePreview = deriveClientMetaAiPreTriage({
      fileName: "fallen_tree_marcos.png",
      fileSize: 512_000,
      mimeType: "image/png",
      hasExifGps: true,
    });
    expect(treePreview.incidentType).toBe("debris");
    expect(treePreview.detectedTags).toContain("EXIF GPS Verified");
  });

  it("updates AI Telemetry status card snapshot in real-time across scanning, pre-triage, and server completion", () => {
    const standby = deriveAiTelemetrySnapshot({
      hasFile: false,
      isScanningClient: false,
      preTriage: null,
      locationChoice: null,
      uploadProgress: null,
      serverStatus: "idle",
    });
    expect(standby.phase).toBe("standby");
    expect(standby.confidencePct).toBeNull();

    const preTriage = deriveClientMetaAiPreTriage({
      fileName: "baha_pasig.jpg",
      fileSize: 320_000,
      mimeType: "image/jpeg",
      hasExifGps: false,
    });

    const scanning = deriveAiTelemetrySnapshot({
      hasFile: true,
      isScanningClient: true,
      scanStepLabel: "Stage 2/2 · Extracting hazard vectors…",
      preTriage,
      locationChoice: null,
      uploadProgress: null,
      serverStatus: "idle",
    });
    expect(scanning.phase).toBe("scanning");
    expect(scanning.isProcessing).toBe(true);
    expect(scanning.confidencePct).toBeLessThan(preTriage.confidencePct);

    const ready = deriveAiTelemetrySnapshot({
      hasFile: true,
      isScanningClient: false,
      preTriage,
      locationChoice: "manual",
      uploadProgress: null,
      serverStatus: "idle",
    });
    expect(ready.phase).toBe("pre_triage_ready");
    expect(ready.confidencePct).toBeGreaterThanOrEqual(preTriage.confidencePct);
    expect(ready.hazardLabels).toContain("Manual Pin Confirmed");

    const completed = deriveAiTelemetrySnapshot({
      hasFile: true,
      isScanningClient: false,
      preTriage,
      locationChoice: "manual",
      uploadProgress: null,
      serverStatus: "review_ready",
      serverTelemetry: {
        modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8",
        incidentType: "flooding",
        preliminarySeverity: 5,
        visibleEvidence: ["Submerged primary roadway", "Stranded vehicles in floodwater"],
        uncertainties: [],
        latencyMs: 640,
      },
    });
    expect(completed.phase).toBe("complete");
    expect(completed.isProcessing).toBe(false);
    expect(completed.confidencePct).toBeGreaterThanOrEqual(90);
    expect(completed.hazardLabels).toContain("Submerged primary roadway");
    expect(completed.latencyMs).toBe(640);
  });
});

