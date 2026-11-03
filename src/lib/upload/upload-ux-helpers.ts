// src/lib/upload/upload-ux-helpers.ts
//
// Pure, deterministic helpers for navigation active-route resolution,
// Step 2 location default selection, and instant Meta AI Vision
// pre-triage preview generation during the photo upload workflow.

export type WizardStep = 1 | 2 | 3;

export type LocationChoiceType = "gps" | "manual" | "unknown";

export interface ExifCoords {
  lat: number;
  lon: number;
  capturedAt?: string | null;
}

export interface MetaAiPreTriagePreview {
  modelId: string;
  pipelineStage: "pre_scan_ready" | "awaiting_server_verification";
  incidentType:
    | "flooding"
    | "blocked_road"
    | "debris"
    | "visible_structural_damage"
    | "medical"
    | "fire"
    | "other";
  incidentLabel: string;
  preliminarySeverity: 1 | 2 | 3 | 4 | 5 | null;
  severityLabel: string;
  confidencePct: number | null;
  detectedTags: string[];
  suggestedTitle: string;
  suggestedDescription: string;
  automationNote: string;
}

/**
 * Determines whether a TopBar navigation link is active for a given pathname.
 * Specifically prevents `/reports` from matching `/reports/new` so that
 * "Reports" and "Submit Report / Upload Photo" are never highlighted at the same time.
 */
export function isNavHrefActive(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (href === "/reports") {
    if (pathname === "/reports") return true;
    if (pathname.startsWith("/reports/new")) return false;
    return pathname.startsWith("/reports/");
  }
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Resolves the default active tab in Step 2 (Confirm Location).
 * When EXIF GPS is present, defaults to "gps".
 * When EXIF GPS is absent, defaults to "manual" ("Place pin manually")
 * so the user never lands on an unselected blank tab.
 */
export function resolveDefaultLocationChoice(
  exif: ExifCoords | null | undefined,
): LocationChoiceType {
  if (
    exif &&
    Number.isFinite(exif.lat) &&
    Number.isFinite(exif.lon) &&
    Math.abs(exif.lat) <= 90 &&
    Math.abs(exif.lon) <= 180
  ) {
    return "gps";
  }
  return "manual";
}

/**
 * Determines whether a user can navigate directly to a target step in the
 * 3-step upload wizard.
 *
 * Non-linear navigation rules:
 * - Step 1 ("Choose photo") is always reachable when not actively uploading.
 * - Step 2 ("Confirm location") is reachable whenever Step 1 has a valid file,
 *   OR when the user has previously confirmed a location in this session.
 * - Step 3 ("Submit") is reachable whenever Step 1 has a valid file AND
 *   Step 2 location has been confirmed (even if the user navigated back to
 *   Step 1 or Step 2 to modify their input).
 */
export function canNavigateToWizardStep(
  targetStep: WizardStep,
  currentStep: WizardStep,
  hasValidFile: boolean,
  hasConfirmedLocation: boolean,
  isUploading: boolean,
): boolean {
  if (isUploading) return false;
  if (targetStep === 1) return true;
  if (targetStep === 2) return hasValidFile;
  if (targetStep === 3) return hasValidFile && (hasConfirmedLocation || currentStep === 3);
  return false;
}

export type WizardStepState = "current" | "completed" | "available" | "locked";

export interface WizardStepDescriptor {
  num: WizardStep;
  shortLabel: string;
  title: string;
  state: WizardStepState;
  completed: boolean;
  reachable: boolean;
  statusBadge: string;
  ariaLabel: string;
}

/**
 * Computes accessible non-linear step metadata for each step in the UploadFlow
 * stepper so users can jump back to completed steps (e.g., 'Confirm location'
 * or 'Choose photo') and return forward without losing progress.
 */
export function buildNonLinearStepperItems(input: {
  currentStep: WizardStep;
  hasValidFile: boolean;
  hasConfirmedLocation: boolean;
  isUploading: boolean;
  isSubmitted: boolean;
}): WizardStepDescriptor[] {
  const definitions: Array<{ num: WizardStep; shortLabel: string; title: string }> = [
    { num: 1, shortLabel: "1. Choose photo", title: "Choose photo" },
    { num: 2, shortLabel: "2. Confirm location", title: "Confirm location" },
    { num: 3, shortLabel: "3. Submit", title: "Submit" },
  ];

  return definitions.map((def) => {
    const reachable = canNavigateToWizardStep(
      def.num,
      input.currentStep,
      input.hasValidFile,
      input.hasConfirmedLocation,
      input.isUploading,
    );

    const completed =
      def.num === 1
        ? input.hasValidFile
        : def.num === 2
        ? input.hasValidFile && input.hasConfirmedLocation
        : input.isSubmitted;

    const isCurrent = input.currentStep === def.num;
    const state: WizardStepState = isCurrent
      ? "current"
      : completed
      ? "completed"
      : reachable
      ? "available"
      : "locked";

    const statusBadge = isCurrent
      ? "Current"
      : completed
      ? "Completed"
      : reachable
      ? "Ready"
      : "Locked";

    const ariaLabel = isCurrent
      ? `Step ${def.num}: ${def.title} (Current step${completed ? ", completed" : ""})`
      : completed
      ? `Step ${def.num}: ${def.title} (Completed — click to review or edit)`
      : reachable
      ? `Step ${def.num}: ${def.title} (Ready — click to open)`
      : `Step ${def.num}: ${def.title} (Locked — complete previous step first)`;

    return {
      num: def.num,
      shortLabel: def.shortLabel,
      title: def.title,
      state,
      completed,
      reachable,
      statusBadge,
      ariaLabel,
    };
  });
}

/**
 * Generates an immediate Meta AI Vision pre-triage preview when a photo
 * is selected or pasted in Step 1. Uses filename, user text cues, and
 * image metadata to surface provisional hazard tags and suggested fields
 * before the full server-side Llama Vision inference runs upon submission.
 */
export function deriveClientMetaAiPreTriage(input: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  hasExifGps: boolean;
  titleHint?: string;
  descriptionHint?: string;
}): MetaAiPreTriagePreview {
  // Before upload, we only know the file metadata. The browser MUST NOT
  // invent hazard classifications, severity, response instructions or a
  // Meta model identity from the filename or reporter-supplied text.
  return {
    modelId: "Awaiting server analysis",
    pipelineStage: "awaiting_server_verification",
    incidentType: "other",
    incidentLabel: "Not analyzed",
    preliminarySeverity: null,
    severityLabel: "Not assessed",
    confidencePct: null,
    detectedTags: input.hasExifGps ? ["Photo contains GPS metadata (unconfirmed)"] : [],
    suggestedTitle: "",
    suggestedDescription: "",
    automationNote: "Only local file and GPS metadata have been checked. Meta analysis begins after submission.",
  };
}

export type AiTelemetryPhase =
  | "standby"
  | "scanning"
  | "pre_triage_ready"
  | "uploading"
  | "analyzing_server"
  | "complete";

export interface ServerAnalysisTelemetry {
  modelId?: string;
  incidentType?: string;
  preliminarySeverity?: number | null;
  visibleEvidence?: string[];
  uncertainties?: string[];
  latencyMs?: number;
}

export interface AiTelemetryCardSnapshot {
  phase: AiTelemetryPhase;
  phaseLabel: string;
  isProcessing: boolean;
  modelId: string;
  confidencePct: number | null;
  confidenceLabel: string;
  primaryHazardLabel: string;
  severityLabel: string;
  preliminarySeverity: number | null;
  hazardLabels: string[];
  statusMessage: string;
  latencyMs?: number;
}

const SERVER_INCIDENT_LABELS: Record<string, string> = {
  flooding: "Flooding & Surface Inundation",
  blocked_road: "Blocked Roadway Corridor",
  debris: "Debris & Fallen Obstruction",
  visible_structural_damage: "Visible Structural Damage",
  other: "General Field Hazard",
  unclear: "Unclear / Needs Human Inspection",
};

/**
 * Computes the real-time state of the compact 'AI Telemetry' status card
 * in UploadFlow as the Meta AI Vision pipeline processes the uploaded photo.
 */
export function deriveAiTelemetrySnapshot(input: {
  hasFile: boolean;
  isScanningClient: boolean;
  scanStepLabel?: string;
  preTriage: MetaAiPreTriagePreview | null;
  locationChoice: LocationChoiceType | null;
  uploadProgress: number | null;
  serverStatus: "idle" | "requesting" | "review_ready" | "processing" | "manual_review" | "unavailable";
  serverTelemetry?: ServerAnalysisTelemetry | null;
}): AiTelemetryCardSnapshot {
  const noConfidence = {
    confidencePct: null,
    confidenceLabel: "Not provided by model",
  };
  const locationTag = input.locationChoice === "manual"
    ? "Reporter-selected location"
    : input.locationChoice === "gps"
      ? "GPS location confirmed by reporter"
      : input.locationChoice === "unknown"
        ? "Location unknown"
        : "Location not confirmed";
  const standby = {
    modelId: "Awaiting Meta inference",
    primaryHazardLabel: "Not analyzed",
    preliminarySeverity: null,
    severityLabel: "Not assessed",
    hazardLabels: [] as string[],
    ...noConfidence,
  };
  if (!input.hasFile || !input.preTriage) {
    return {
      phase: "standby", phaseLabel: "AWAITING PHOTO",
      isProcessing: false, ...standby,
      statusMessage: "Select a photo. AI inference only starts after the photo is submitted.",
    };
  }
  if (input.isScanningClient) {
    return {
      phase: "scanning", phaseLabel: "CHECKING FILE METADATA",
      isProcessing: true, ...standby,
      hazardLabels: [locationTag],
      statusMessage: "Checking local file metadata; no AI analysis has run.",
    };
  }
  if (input.uploadProgress !== null) {
    return {
      phase: "uploading", phaseLabel: `UPLOADING PHOTO · ${input.uploadProgress}%`,
      isProcessing: true, ...standby,
      hazardLabels: [locationTag],
      statusMessage: "Uploading photo securely. AI analysis will start after the upload completes.",
    };
  }
  if (input.serverStatus === "requesting" || input.serverStatus === "processing") {
    return {
      phase: "analyzing_server", phaseLabel: "META ANALYSIS REQUESTED",
      isProcessing: true, ...standby,
      hazardLabels: [locationTag],
      statusMessage: "Waiting for the server's real Meta inference result.",
    };
  }
  if (input.serverStatus === "review_ready" && input.serverTelemetry) {
    const obs = input.serverTelemetry;
    const severity = obs.preliminarySeverity ?? null;
    return {
      phase: "complete",
      phaseLabel: "AI OBSERVATION SAVED · HUMAN REVIEW PENDING",
      isProcessing: false,
      modelId: obs.modelId ?? "Meta model (identifier unavailable)",
      primaryHazardLabel:
        (obs.incidentType && SERVER_INCIDENT_LABELS[obs.incidentType]) || "Observation recorded",
      preliminarySeverity: severity,
      severityLabel: severity === null ? "Not assessed" : `Provisional severity ${severity}/5`,
      hazardLabels: obs.visibleEvidence?.slice(0, 4) ?? [],
      ...noConfidence,
      statusMessage: "Server analysis completed. This observation is provisional until human review.",
      latencyMs: obs.latencyMs,
    };
  }
  return {
    phase: "pre_triage_ready",
    phaseLabel: input.serverStatus === "manual_review" ? "MANUAL REVIEW NEEDED"
      : input.serverStatus === "unavailable" ? "AI ANALYSIS UNAVAILABLE" : "PHOTO READY",
    isProcessing: false, ...standby,
    hazardLabels: [locationTag],
    statusMessage: input.serverStatus === "manual_review"
      ? "The saved photo is awaiting manual review. No AI finding has been confirmed."
      : input.serverStatus === "unavailable"
        ? "Automated analysis is unavailable. Your saved photo remains available."
        : "Ready to submit. No AI inference has run.",
  };
}
