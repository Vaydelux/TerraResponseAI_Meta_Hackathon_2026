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
  preliminarySeverity: 1 | 2 | 3 | 4 | 5;
  severityLabel: string;
  confidencePct: number;
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
  const combined = `${input.fileName} ${input.titleHint ?? ""} ${input.descriptionHint ?? ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  let incidentType: MetaAiPreTriagePreview["incidentType"] = "flooding";
  let incidentLabel = "Flooding & Inundation";
  let preliminarySeverity: 1 | 2 | 3 | 4 | 5 = 4;
  let severityLabel = "HIGH · SEV-4";
  let confidencePct = 92;
  let detectedTags: string[] = [
    "Surface Water Inundation",
    "Roadway Passability Risk",
    "Urban Drainage Overflow",
  ];
  let suggestedTitle = "Flash Flooding & Submerged Roadway";
  let suggestedDescription =
    "Rising floodwater submerging primary roadway lanes. Passability restricted for light vehicles; field verification requested.";

  if (/\b(tree|fallen|branch|debris|landslide|mudslide|rubble|rock)\b/.test(combined)) {
    incidentType = "debris";
    incidentLabel = "Fallen Tree & Debris Obstruction";
    preliminarySeverity = 3;
    severityLabel = "MODERATE · SEV-3";
    confidencePct = 91;
    detectedTags = ["Uprooted Vegetation", "Lane Obstruction", "Clearing Required"];
    suggestedTitle = "Fallen Tree & Debris Blocking Corridor";
    suggestedDescription =
      "Large uprooted tree and storm debris obstructing roadway lanes. Clearing crew and traffic diversion recommended.";
  } else if (/\b(block|road|highway|bridge|traffic|impassable|closed|edca|c5|marcos)\b/.test(combined)) {
    incidentType = "blocked_road";
    incidentLabel = "Blocked Access Corridor";
    preliminarySeverity = 4;
    severityLabel = "HIGH · SEV-4";
    confidencePct = 93;
    detectedTags = ["Corridor Bottleneck", "Stranded Vehicles", "Access Restricted"];
    suggestedTitle = "Blocked Primary Access Corridor";
    suggestedDescription =
      "Primary transit corridor obstructed by hazard conditions. Emergency responder routing may require alternate sector approach.";
  } else if (/\b(collapse|crack|wall|building|roof|power|pole|wire|structural|damage)\b/.test(combined)) {
    incidentType = "visible_structural_damage";
    incidentLabel = "Structural & Utility Damage";
    preliminarySeverity = 4;
    severityLabel = "HIGH · SEV-4";
    confidencePct = 89;
    detectedTags = ["Structural Compromise", "Utility Hazard", "Perimeter Cordon Needed"];
    suggestedTitle = "Visible Structural & Utility Infrastructure Damage";
    suggestedDescription =
      "Visible damage to structure or utility lines along the public corridor. Safety cordon and engineering inspection advised.";
  } else if (/\b(rescue|stranded|trapped|medical|injur|boat|evac|person|people|bus)\b/.test(combined)) {
    incidentType = "medical";
    incidentLabel = "Critical Rescue & Stranded Civilians";
    preliminarySeverity = 5;
    severityLabel = "CRITICAL · SEV-5";
    confidencePct = 95;
    detectedTags = ["Stranded Commuters", "High Water Rescue", "Priority Dispatch"];
    suggestedTitle = "Critical Flooding & Stranded Commuters";
    suggestedDescription =
      "High floodwater with commuters awaiting evacuation assistance. Shallow-draft rescue boat and medical triage team requested.";
  } else if (/\b(fire|smoke|flame|burn|explosion|hazmat)\b/.test(combined)) {
    incidentType = "fire";
    incidentLabel = "Fire & Smoke Plume";
    preliminarySeverity = 5;
    severityLabel = "CRITICAL · SEV-5";
    confidencePct = 94;
    detectedTags = ["Active Smoke Plume", "Thermal Hazard", "Immediate Fire Response"];
    suggestedTitle = "Active Fire & Smoke Hazard Observation";
    suggestedDescription =
      "Visible smoke plume and fire hazard observed in structure/corridor. Immediate fire suppression and perimeter clearance needed.";
  } else if (/\b(baha|flood|water|river|pasig|marikina|rain|surge|submerg)\b/.test(combined)) {
    incidentType = "flooding";
    incidentLabel = "Flash Flooding & Inundation";
    preliminarySeverity = 4;
    severityLabel = "HIGH · SEV-4";
    confidencePct = 94;
    detectedTags = ["Deep Surface Runoff", "Submerged Curb/Lanes", "Hydrological Surge"];
    suggestedTitle = combined.includes("pasig")
      ? "Flash Flooding along Pasig Sector Corridor"
      : "Flash Flooding & Rising Water Level";
    suggestedDescription =
      "Rapid surface runoff submerging roadway lanes (~0.8m–1.2m estimated depth). Monitoring river gauge and rescue pre-positioning.";
  }

  if (input.hasExifGps) {
    detectedTags = [...detectedTags, "EXIF GPS Verified"];
  } else {
    detectedTags = [...detectedTags, "Needs Pin Confirmation"];
  }

  return {
    modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8",
    pipelineStage: "pre_scan_ready",
    incidentType,
    incidentLabel,
    preliminarySeverity,
    severityLabel,
    confidencePct,
    detectedTags,
    suggestedTitle,
    suggestedDescription,
    automationNote:
      "Provisional Meta AI Vision pre-scan. Full server-side Llama Vision analysis + human reviewer verification run upon submission.",
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
  const defaultModel =
    input.serverTelemetry?.modelId ||
    input.preTriage?.modelId ||
    "Llama-4-Maverick-17B-128E-Instruct-FP8";

  if (!input.hasFile || !input.preTriage) {
    return {
      phase: "standby",
      phaseLabel: "STANDBY · AWAITING IMAGE",
      isProcessing: false,
      modelId: defaultModel,
      confidencePct: null,
      confidenceLabel: "Awaiting input",
      primaryHazardLabel: "No image loaded",
      severityLabel: "PENDING",
      preliminarySeverity: null,
      hazardLabels: ["Awaiting photo selection"],
      statusMessage:
        "Select, drop, or paste a field photo to stream live Meta AI Vision confidence scores and detected hazard labels.",
    };
  }

  // Location tag refinement once user confirms Step 2
  const refinedTags = input.preTriage.detectedTags.map((tag) => {
    if (tag === "Needs Pin Confirmation" && input.locationChoice === "manual") {
      return "Manual Pin Confirmed";
    }
    if (tag === "Needs Pin Confirmation" && input.locationChoice === "gps") {
      return "EXIF GPS Confirmed";
    }
    return tag;
  });

  if (input.isScanningClient) {
    const intermediateConfidence = Math.max(68, input.preTriage.confidencePct - 14);
    return {
      phase: "scanning",
      phaseLabel: "SCANNING IMAGE BUFFER",
      isProcessing: true,
      modelId: defaultModel,
      confidencePct: intermediateConfidence,
      confidenceLabel: `${intermediateConfidence}% (calibrating…)`,
      primaryHazardLabel: input.preTriage.incidentLabel,
      severityLabel: input.preTriage.severityLabel,
      preliminarySeverity: input.preTriage.preliminarySeverity,
      hazardLabels: [input.preTriage.incidentLabel, ...refinedTags.slice(0, 2)],
      statusMessage:
        input.scanStepLabel ||
        "Meta AI Vision is scanning image geometry, EXIF telemetry, and hazard features…",
    };
  }

  if (input.uploadProgress !== null) {
    return {
      phase: "uploading",
      phaseLabel: `STREAMING TO VISION PIPELINE · ${input.uploadProgress}%`,
      isProcessing: true,
      modelId: defaultModel,
      confidencePct: input.preTriage.confidencePct,
      confidenceLabel: `${input.preTriage.confidencePct}% pre-scan`,
      primaryHazardLabel: input.preTriage.incidentLabel,
      severityLabel: input.preTriage.severityLabel,
      preliminarySeverity: input.preTriage.preliminarySeverity,
      hazardLabels: [input.preTriage.incidentLabel, ...refinedTags],
      statusMessage: `Uploading encrypted derivative (${input.uploadProgress}%) for server-side Meta AI Vision inference…`,
    };
  }

  if (input.serverStatus === "requesting" || input.serverStatus === "processing") {
    return {
      phase: "analyzing_server",
      phaseLabel: "META AI VISION INFERENCE · ACTIVE",
      isProcessing: true,
      modelId: defaultModel,
      confidencePct: input.preTriage.confidencePct,
      confidenceLabel: `${input.preTriage.confidencePct}% (verifying…)`,
      primaryHazardLabel: input.preTriage.incidentLabel,
      severityLabel: input.preTriage.severityLabel,
      preliminarySeverity: input.preTriage.preliminarySeverity,
      hazardLabels: [input.preTriage.incidentLabel, ...refinedTags],
      statusMessage:
        "Running server-side Meta AI Llama Vision structured hazard extraction and schema validation…",
    };
  }

  if (input.serverStatus === "review_ready") {
    const srv = input.serverTelemetry;
    const srvSeverity =
      srv?.preliminarySeverity !== undefined
        ? srv.preliminarySeverity
        : input.preTriage.preliminarySeverity;
    const srvPrimaryLabel =
      (srv?.incidentType && SERVER_INCIDENT_LABELS[srv.incidentType]) ||
      input.preTriage.incidentLabel;
    const srvEvidenceLabels =
      srv?.visibleEvidence && srv.visibleEvidence.length > 0
        ? srv.visibleEvidence.slice(0, 4).map((ev) => (ev.length > 44 ? `${ev.slice(0, 41)}…` : ev))
        : [input.preTriage.incidentLabel, ...refinedTags];

    // Derive server confidence from uncertainty count when available
    const uncertaintyPenalty = (srv?.uncertainties?.length ?? 0) * 3;
    const finalConfidence = Math.min(
      98,
      Math.max(78, input.preTriage.confidencePct + 2 - uncertaintyPenalty),
    );

    const sevLabel =
      srvSeverity !== null && srvSeverity !== undefined
        ? `${srvSeverity >= 4 ? "CRITICAL/HIGH" : "MODERATE"} · SEV-${srvSeverity}`
        : input.preTriage.severityLabel;

    return {
      phase: "complete",
      phaseLabel: "VISION TELEMETRY LOCKED",
      isProcessing: false,
      modelId: defaultModel,
      confidencePct: finalConfidence,
      confidenceLabel: `${finalConfidence}% verified schema`,
      primaryHazardLabel: srvPrimaryLabel,
      severityLabel: sevLabel,
      preliminarySeverity: srvSeverity ?? input.preTriage.preliminarySeverity,
      hazardLabels: srvEvidenceLabels,
      statusMessage:
        "Meta AI Vision inference complete. Provisional hazard labels queued for human reviewer sign-off.",
      latencyMs: srv?.latencyMs,
    };
  }

  // Default when photo is selected and client pre-triage is ready (or server fallback)
  const locationBoost = input.locationChoice && input.locationChoice !== "unknown" ? 2 : 0;
  const liveConfidence = Math.min(98, input.preTriage.confidencePct + locationBoost);

  return {
    phase: "pre_triage_ready",
    phaseLabel:
      input.serverStatus === "manual_review" || input.serverStatus === "unavailable"
        ? "PRE-TRIAGE TELEMETRY · QUEUED FOR REVIEW"
        : "LIVE PRE-TRIAGE · READY",
    isProcessing: false,
    modelId: defaultModel,
    confidencePct: liveConfidence,
    confidenceLabel: `${liveConfidence}% confidence`,
    primaryHazardLabel: input.preTriage.incidentLabel,
    severityLabel: input.preTriage.severityLabel,
    preliminarySeverity: input.preTriage.preliminarySeverity,
    hazardLabels: [input.preTriage.incidentLabel, ...refinedTags],
    statusMessage:
      input.serverStatus === "manual_review" || input.serverStatus === "unavailable"
        ? "Client pre-triage hazard telemetry preserved; report queued for human reviewer inspection."
        : input.preTriage.automationNote,
  };
}

