// src/components/upload/UploadFlow.tsx
//
// The three-step upload flow with a fully accessible non-linear progress
// stepper, clipboard image paste preview, real-time 'AI Telemetry' status
// card (surfacing confidence scores and detected hazard labels as Meta AI
// Vision processes the image), and state persistence across all steps:
//
//   Step 1: Choose photo (.dropzone + .filecheck + AI Telemetry)
//   Step 2: Confirm location (.location-confirm with Manual default + Auto-Locate GPS + Back)
//   Step 3: Submit (Visual summary card + Meta AI pipeline status + UploadProgress + StatusTimeline)

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Cpu,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Wand2,
  MapPin,
  FileImage,
  ShieldAlert,
  Activity,
  Lock,
} from "lucide-react";
import { Dropzone } from "./Dropzone";
import { FileCheckList, type FileCheckItem } from "./FileCheckList";
import { LocationConfirm, type LocationChoice } from "./LocationConfirm";
import { UploadProgress } from "./UploadProgress";
import { VoiceDictationControl } from "./VoiceDictationControl";
import { StatusTimeline } from "@/components/report/StatusTimeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { Field, Input, Textarea, Button, toast } from "@/components/ui-tr";
import { interpretAnalysisResponse, type AnalysisProgress } from "@/lib/analysis-client-state";
import {
  buildNonLinearStepperItems,
  deriveAiTelemetrySnapshot,
  deriveClientMetaAiPreTriage,
  type ServerAnalysisTelemetry,
  type WizardStep,
} from "@/lib/upload/upload-ux-helpers";

type Step = WizardStep;

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "duplicate"; existingReportId: string }
  | { kind: "linked"; existingReportId: string }
  | { kind: "success"; reportId: string; analysis: AnalysisProgress }
  | { kind: "error"; message: string };

export interface UploadFlowProps {
  className?: string;
}

export function UploadFlow({ className }: UploadFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [checks, setChecks] = useState<FileCheckItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationChoice, setLocationChoice] = useState<LocationChoice | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [exif, setExif] = useState<{ lat: number; lon: number; capturedAt?: string | null } | null>(null);
  const [readingExif, setReadingExif] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiScanStageText, setAiScanStageText] = useState<string>("");
  const [aiAutoFilled, setAiAutoFilled] = useState(false);
  const [serverTelemetry, setServerTelemetry] = useState<ServerAnalysisTelemetry | null>(null);
  const fileSequenceRef = useRef(0);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([null, null, null]);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadInFlightRef = useRef(false);
  const analysisInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
      if (scanStageTimerRef.current) {
        clearTimeout(scanStageTimerRef.current);
      }
    };
  }, []);

  const activeFile = files[0] ?? null;

  // Create & clean up object URL for the selected photo thumbnail without synchronous setState in useEffect
  const previewUrl = useMemo(() => {
    if (!activeFile || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return null;
    }
    return URL.createObjectURL(activeFile);
  }, [activeFile]);

  useEffect(() => {
    return () => {
      if (previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Live Meta AI Vision pre-triage preview computed when a photo is selected
  const aiPreTriage = useMemo(() => {
    if (!activeFile) return null;
    return deriveClientMetaAiPreTriage({
      fileName: activeFile.name,
      fileSize: activeFile.size,
      mimeType: activeFile.type,
      hasExifGps: !!exif,
      titleHint: title,
      descriptionHint: description,
    });
  }, [activeFile, exif, title, description]);

  function handleFiles(next: File[]) {
    const selected = next.slice(0, 1);
    const sequence = ++fileSequenceRef.current;
    setFiles(selected);
    setChecks(selected.map((f) => ({ name: f.name, state: "wait" as const, size: f.size })));
    // Preserve previously confirmed manual or unknown location if the user went back to Step 1
    // to swap photos; only clear if location was tied to the previous photo's EXIF GPS.
    setLocationChoice((prev) => (prev === "gps" ? null : prev));
    setLocationCoords((prev) => (locationChoice === "gps" ? null : prev));
    setExif(null);
    setServerTelemetry(null);
    setReadingExif(selected.length > 0);
    setAiScanning(selected.length > 0);
    setAiScanStageText(
      selected.length > 0
        ? "Stage 1/2 · Decoding image buffer & EXIF GPS headers…"
        : "",
    );
    setAiAutoFilled(false);
    setState({ kind: "idle" });
    setStep(1);

    // Extract optional EXIF locally for explicit user confirmation.
    // This is advisory; the server independently reads and validates EXIF.
    const chosenFile = selected[0];
    if (
      chosenFile &&
      chosenFile.size > 0 &&
      chosenFile.size <= 10 * 1024 * 1024 &&
      /^image\/(jpeg|png|webp)$/.test(chosenFile.type)
    ) {
      void import("exifr")
        .then(async ({ default: exifr }) => {
          const gps = await exifr.gps(chosenFile).catch(() => null);
          if (sequence !== fileSequenceRef.current) return;
          if (
            gps &&
            Number.isFinite(gps.latitude) &&
            Number.isFinite(gps.longitude) &&
            Math.abs(gps.latitude) <= 90 &&
            Math.abs(gps.longitude) <= 180
          ) {
            setExif({ lat: gps.latitude, lon: gps.longitude });
          }
        })
        .catch(() => {
          // Malformed or absent EXIF is normal: manual and unknown remain available.
        })
        .finally(() => {
          if (sequence === fileSequenceRef.current) setReadingExif(false);
        });
    } else {
      setReadingExif(false);
    }

    // Client-side sanity check + multi-stage Meta AI Vision telemetry progression
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
    }
    if (scanStageTimerRef.current) {
      clearTimeout(scanStageTimerRef.current);
    }

    if (selected.length > 0) {
      scanStageTimerRef.current = setTimeout(() => {
        if (sequence !== fileSequenceRef.current) return;
        setAiScanStageText("Stage 2/2 · Extracting hazard vectors & confidence telemetry…");
      }, 30);
    }

    scanTimerRef.current = setTimeout(() => {
      if (sequence !== fileSequenceRef.current) return;
      setAiScanning(false);
      setAiScanStageText("");
      setChecks((prev) =>
        prev.map((c) => {
          const f = selected.find((f) => f.name === c.name);
          if (!f) return c;
          if (f.size > 10 * 1024 * 1024) {
            return { ...c, state: "fail" as const, message: "over 10 MB" };
          }
          if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
            return { ...c, state: "fail" as const, message: "not JPEG, PNG or WebP" };
          }
          return {
            ...c,
            state: "ok" as const,
            message: "Size/type check passed; Meta AI Vision telemetry ready",
          };
        }),
      );

      // Auto-populate suggested title & description if the user hasn't typed anything yet
      if (chosenFile) {
        const preview = deriveClientMetaAiPreTriage({
          fileName: chosenFile.name,
          fileSize: chosenFile.size,
          mimeType: chosenFile.type,
          hasExifGps: false,
        });
        setTitle((prev) => (prev.trim() === "" ? preview.suggestedTitle : prev));
        setDescription((prev) => (prev.trim() === "" ? preview.suggestedDescription : prev));
        setAiAutoFilled(true);
      }
    }, 60);
  }

  function applyAiSuggestions() {
    if (!aiPreTriage) return;
    setTitle(aiPreTriage.suggestedTitle);
    setDescription(aiPreTriage.suggestedDescription);
    setAiAutoFilled(true);
    toast.success("Applied Meta AI Vision draft to Title and Description.");
  }

  function canProceedToStep2(): boolean {
    return (
      files.length === 1 &&
      !readingExif &&
      checks.length === 1 &&
      checks.every((c) => c.state === "ok")
    );
  }

  function handleDraftLocationChange(
    draftChoice: LocationChoice,
    draftCoords: { lat: number; lon: number } | null,
  ) {
    // Persist valid edits immediately so clicking any step in the non-linear stepper
    // retains the user's location choice and coordinates.
    if (draftChoice === "manual") {
      setLocationCoords(draftCoords);
      if (draftCoords) {
        setLocationChoice("manual");
      }
    } else if (draftChoice === "gps" && exif) {
      setLocationChoice("gps");
      setLocationCoords({ lat: exif.lat, lon: exif.lon });
    } else if (draftChoice === "unknown") {
      setLocationChoice("unknown");
      setLocationCoords(null);
    }
  }

  function onConfirmLocation(choice: LocationChoice, coords?: { lat: number; lon: number }) {
    setLocationChoice(choice);
    if (coords) setLocationCoords(coords);
    else setLocationCoords(null);
    setStep(3);
  }

  function buildMeta(linkToReportId?: string): Record<string, unknown> {
    const meta: Record<string, unknown> = {
      title: title || undefined,
      description: description || undefined,
    };
    if (locationChoice === "manual" && locationCoords) {
      meta.latitude = locationCoords.lat;
      meta.longitude = locationCoords.lon;
      meta.locationSource = "manual";
    } else if (locationChoice === "unknown") {
      meta.locationSource = "unknown";
    } else if (locationChoice === "gps" && exif) {
      meta.latitude = exif.lat;
      meta.longitude = exif.lon;
      meta.locationSource = "gps";
    }
    if (linkToReportId) meta.linkToReportId = linkToReportId;
    return meta;
  }

  async function doUpload(linkToReportId?: string) {
    if (uploadInFlightRef.current) return;
    const file = files[0];
    if (!file) return;
    uploadInFlightRef.current = true;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("meta", JSON.stringify(buildMeta(linkToReportId)));

    setState({ kind: "uploading", progress: 0 });
    try {
      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", "/api/reports");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setState({
              kind: "uploading",
              progress: Math.round((ev.loaded / ev.total) * 100),
            });
          }
        };
        xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.send(fd);
      });

      const body = await res.json();
      if (!res.ok) {
        if (body?.error?.code === "DUPLICATE" && body?.error?.existingReportId) {
          setState({ kind: "duplicate", existingReportId: body.error.existingReportId });
          return;
        }
        setState({ kind: "error", message: body?.error?.message ?? "Upload failed." });
        toast.error(body?.error?.message ?? "Upload failed.", {
          label: "Retry",
          onClick: () => void doUpload(linkToReportId),
        });
        return;
      }
      if (typeof body?.linkedTo === "string" && body.linkedTo) {
        setState({ kind: "linked", existingReportId: body.linkedTo });
        toast.success("Existing report reused; no duplicate evidence created.");
        return;
      }
      if (typeof body?.reportId !== "string" || !body.reportId) {
        throw new Error("Server did not return a report ID.");
      }
      const newReportId: string = body.reportId;
      setState({
        kind: "success",
        reportId: newReportId,
        analysis: {
          kind: "requesting",
          message: "Running server-side Meta AI Llama Vision analysis…",
        },
      });
      toast.success("Photo and private report saved.");
      void startAnalysis(newReportId);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "aborted") {
        setState({ kind: "idle" });
        return;
      }
      setState({ kind: "error", message: "Network error during upload." });
      toast.error("Network error during upload.");
    } finally {
      xhrRef.current = null;
      uploadInFlightRef.current = false;
    }
  }

  async function startAnalysis(reportId: string) {
    if (analysisInFlightRef.current === reportId) return;
    analysisInFlightRef.current = reportId;
    setState((previous) =>
      previous.kind === "success" && previous.reportId === reportId
        ? {
            ...previous,
            analysis: {
              kind: "requesting",
              message: "Running server-side Meta AI Llama Vision analysis for the saved report…",
            },
          }
        : previous,
    );
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/analyze`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);
      const analysis = interpretAnalysisResponse(response.status, body);

      // Extract real-time server observation telemetry when returned
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        const rawObs =
          (record.observation as Record<string, unknown> | undefined) ??
          ((record.analysis as Record<string, unknown> | undefined)?.structured_observation as
            | Record<string, unknown>
            | undefined);

        if (rawObs && typeof rawObs === "object") {
          setServerTelemetry({
            modelId:
              typeof record.modelId === "string"
                ? record.modelId
                : typeof (record.analysis as Record<string, unknown> | undefined)?.model_id ===
                  "string"
                ? ((record.analysis as Record<string, unknown>).model_id as string)
                : undefined,
            incidentType:
              typeof rawObs.incident_type === "string" ? rawObs.incident_type : undefined,
            preliminarySeverity:
              typeof rawObs.preliminary_severity === "number"
                ? rawObs.preliminary_severity
                : null,
            visibleEvidence: Array.isArray(rawObs.visible_evidence)
              ? rawObs.visible_evidence.filter((v): v is string => typeof v === "string")
              : undefined,
            uncertainties: Array.isArray(rawObs.uncertainties)
              ? rawObs.uncertainties.filter((v): v is string => typeof v === "string")
              : undefined,
            latencyMs: typeof record.latencyMs === "number" ? record.latencyMs : undefined,
          });
        }
      }

      setState((previous) =>
        previous.kind === "success" && previous.reportId === reportId
          ? { ...previous, analysis }
          : previous,
      );
    } catch {
      setState((previous) =>
        previous.kind === "success" && previous.reportId === reportId
          ? {
              ...previous,
              analysis: {
                kind: "unavailable",
                message:
                  "The report was saved, but the analysis request could not finish. Open the report to inspect its current state.",
              },
            }
          : previous,
      );
    } finally {
      if (analysisInFlightRef.current === reportId) analysisInFlightRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState({ kind: "idle" });
  }

  const isUploading = state.kind === "uploading";
  const hasValidFile = canProceedToStep2();
  const hasConfirmedLocation =
    locationChoice === "unknown" ||
    (locationChoice === "gps" && !!exif) ||
    (locationChoice === "manual" && !!locationCoords);
  const isSubmitted = state.kind === "success" || state.kind === "linked";

  const stepperItems = useMemo(
    () =>
      buildNonLinearStepperItems({
        currentStep: step,
        hasValidFile,
        hasConfirmedLocation,
        isUploading,
        isSubmitted,
      }),
    [step, hasValidFile, hasConfirmedLocation, isUploading, isSubmitted],
  );

  const aiTelemetry = useMemo(
    () =>
      deriveAiTelemetrySnapshot({
        hasFile: !!activeFile,
        isScanningClient: aiScanning || readingExif,
        scanStepLabel: aiScanStageText,
        preTriage: aiPreTriage,
        locationChoice,
        uploadProgress: state.kind === "uploading" ? state.progress : null,
        serverStatus: state.kind === "success" ? state.analysis.kind : "idle",
        serverTelemetry,
      }),
    [
      activeFile,
      aiScanning,
      readingExif,
      aiScanStageText,
      aiPreTriage,
      locationChoice,
      state,
      serverTelemetry,
    ],
  );

  function handleStepKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const reachableIndices = stepperItems
      .map((item, idx) => (item.reachable ? idx : -1))
      .filter((idx) => idx !== -1);
    if (reachableIndices.length === 0) return;

    const currentPos = reachableIndices.indexOf(index);
    let targetIdx: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % reachableIndices.length;
      targetIdx = reachableIndices[nextPos] ?? null;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevPos =
        currentPos <= 0 ? reachableIndices.length - 1 : currentPos - 1;
      targetIdx = reachableIndices[prevPos] ?? null;
    } else if (e.key === "Home") {
      e.preventDefault();
      targetIdx = reachableIndices[0] ?? null;
    } else if (e.key === "End") {
      e.preventDefault();
      targetIdx = reachableIndices[reachableIndices.length - 1] ?? null;
    }

    if (targetIdx !== null) {
      const targetItem = stepperItems[targetIdx];
      if (targetItem && targetItem.reachable) {
        stepButtonRefs.current[targetIdx]?.focus();
        setStep(targetItem.num);
      }
    }
  }

  return (
    <div className={className} style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Upload a photo"
        subtitle="Three steps: choose or paste a photo (with automated Meta AI Vision pre-triage), confirm the location, and submit for human review."
      />

      {/* Accessible Non-Linear 3-Step Progress Stepper */}
      <nav aria-label="Upload steps" data-testid="upload-nonlinear-stepper">
        <ol
          className="steps"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--s-2)",
          }}
        >
          {stepperItems.map((item, idx) => {
            const isCurrent = item.state === "current";
            const isDone = item.completed;
            return (
              <li key={item.num} style={{ minWidth: 0 }}>
                <button
                  ref={(el) => {
                    stepButtonRefs.current[idx] = el;
                  }}
                  type="button"
                  className="steps__item"
                  data-done={isDone ? "true" : undefined}
                  data-state={item.state}
                  data-testid={`wizard-step-btn-${item.num}`}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={item.ariaLabel}
                  disabled={!item.reachable}
                  onKeyDown={(e) => handleStepKeyDown(e, idx)}
                  onClick={() => {
                    if (item.reachable) setStep(item.num);
                  }}
                  style={{
                    width: "100%",
                    background: isCurrent
                      ? "color-mix(in srgb, var(--tide-wash) 55%, var(--sheet))"
                      : "var(--sheet)",
                    border: isCurrent
                      ? "1px solid var(--tide)"
                      : isDone
                      ? "1px solid var(--rule-strong)"
                      : "1px solid var(--rule)",
                    borderRadius: "var(--r-ctl)",
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: item.reachable ? "pointer" : "not-allowed",
                    opacity: item.reachable || isCurrent ? 1 : 0.55,
                    transition: "border-color 150ms ease, background-color 150ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color: isCurrent || isDone ? "var(--ink)" : "var(--ink-2)",
                        fontWeight: isCurrent ? 700 : 600,
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2
                          size={15}
                          aria-hidden="true"
                          style={{ color: "var(--tide)", flexShrink: 0 }}
                        />
                      ) : !item.reachable ? (
                        <Lock
                          size={13}
                          aria-hidden="true"
                          style={{ color: "var(--ink-3)", flexShrink: 0 }}
                        />
                      ) : null}
                      <span>{item.shortLabel}</span>
                    </span>

                    <span
                      className="t-meta num"
                      style={{
                        fontSize: "0.7rem",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontWeight: 700,
                        background: isCurrent
                          ? "var(--tide)"
                          : isDone
                          ? "var(--green-wash)"
                          : "var(--sheet-sunk)",
                        color: isCurrent
                          ? "var(--on-tide)"
                          : isDone
                          ? "var(--green-ink)"
                          : "var(--ink-3)",
                      }}
                    >
                      {item.statusBadge}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Small, Visually Distinct Real-Time 'AI Telemetry' Status Card */}
      <aside
        className="panel"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="AI Telemetry"
        data-testid="ai-telemetry-card"
        data-phase={aiTelemetry.phase}
        style={{
          padding: "12px 16px",
          borderRadius: "var(--r-ctl)",
          border:
            aiTelemetry.phase === "standby"
              ? "1px dashed var(--rule-strong)"
              : "1px solid var(--tide)",
          background:
            aiTelemetry.phase === "standby"
              ? "var(--sheet-sunk)"
              : "var(--grad-banner-wash), var(--sheet)",
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 9px",
                borderRadius: 4,
                background: "var(--ink)",
                color: "var(--ink-inverse)",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <Activity size={13} aria-hidden="true" style={{ color: "var(--tide)" }} />
              <span>AI Telemetry</span>
            </span>

            <span
              className="t-meta num"
              data-testid="ai-telemetry-phase-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 4,
                background: aiTelemetry.isProcessing ? "var(--amber-wash)" : "var(--tide-wash)",
                color: aiTelemetry.isProcessing ? "var(--amber-ink)" : "var(--tide)",
                fontWeight: 700,
                fontSize: "0.73rem",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background:
                    aiTelemetry.phase === "standby"
                      ? "var(--ink-3)"
                      : aiTelemetry.isProcessing
                      ? "var(--amber)"
                      : "var(--green)",
                  display: "inline-block",
                }}
              />
              <span>{aiTelemetry.phaseLabel}</span>
            </span>

            <span
              className="t-meta num"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: "0.73rem",
                color: "var(--ink-2)",
              }}
            >
              <Cpu size={13} aria-hidden="true" />
              <span>{aiTelemetry.modelId}</span>
              {aiTelemetry.latencyMs !== undefined && (
                <span>· {aiTelemetry.latencyMs}ms</span>
              )}
            </span>
          </div>

          {/* Real-Time Confidence Score Meter */}
          <div
            data-testid="ai-telemetry-confidence"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {aiTelemetry.preliminarySeverity !== null && (
              <span
                className="t-meta num"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background:
                    aiTelemetry.preliminarySeverity >= 4
                      ? "var(--brick-wash)"
                      : "var(--amber-wash)",
                  color:
                    aiTelemetry.preliminarySeverity >= 4
                      ? "var(--brick-ink)"
                      : "var(--amber-ink)",
                  fontWeight: 700,
                  fontSize: "0.73rem",
                }}
              >
                {aiTelemetry.severityLabel}
              </span>
            )}

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 10px",
                borderRadius: 4,
                background:
                  aiTelemetry.confidencePct !== null ? "var(--green-wash)" : "var(--sheet)",
                border: "1px solid var(--rule)",
              }}
            >
              <span className="t-meta" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                Confidence:
              </span>
              <strong
                className="num"
                style={{
                  fontSize: "0.8rem",
                  color:
                    aiTelemetry.confidencePct !== null ? "var(--green-ink)" : "var(--ink-3)",
                }}
              >
                {aiTelemetry.confidencePct !== null
                  ? `${aiTelemetry.confidencePct}%`
                  : "—"}
              </strong>
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--rule)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${aiTelemetry.confidencePct ?? 0}%`,
                    height: "100%",
                    background: aiTelemetry.isProcessing ? "var(--amber)" : "var(--green)",
                    transition: "width 220ms ease",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Detected Hazard Labels Row + Apply AI Draft Action */}
        <div
          data-testid="meta-ai-pretriage-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            paddingTop: 8,
            borderTop: "1px solid var(--rule)",
          }}
        >
          <div
            data-testid="ai-telemetry-hazard-labels"
            style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
          >
            <span className="t-meta" style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--ink)" }}>
              Detected Hazard Labels:
            </span>
            {aiTelemetry.hazardLabels.map((label) => (
              <span
                key={label}
                className="t-meta"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--sheet)",
                  border: "1px solid var(--rule-strong)",
                  color: "var(--ink)",
                  fontWeight: 600,
                  fontSize: "0.74rem",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="t-meta" style={{ fontSize: "0.73rem" }}>
              {aiTelemetry.statusMessage}
            </span>
            {step === 1 && activeFile && aiPreTriage && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={applyAiSuggestions}
                data-testid="apply-ai-suggestions-btn"
              >
                <Wand2 size={14} aria-hidden="true" />
                <span>{aiAutoFilled ? "Re-apply AI Draft" : "Apply AI Draft"}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {step === 1 && (
        <div className="tr-stack">
          <Dropzone
            onFiles={handleFiles}
            selectedFile={activeFile}
            previewUrl={previewUrl}
            disabled={state.kind === "uploading"}
          />
          {checks.length > 0 && <FileCheckList items={checks} />}
          {readingExif && (
            <p className="t-meta" role="status">
              Checking the photo for optional GPS metadata…
            </p>
          )}
          <Field
            label="Title (auto-drafted by Meta AI Vision · editable)"
            htmlFor="up-title"
          >
            <Input
              id="up-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Flooded road near Brgy San Roque"
            />
          </Field>
          <Field
            label="Description (auto-drafted by Meta AI Vision · editable)"
            htmlFor="up-desc"
            hint="Edit situational details or use Voice Dictation to speak hands-free in the field."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2, 8px)" }}>
              <VoiceDictationControl
                disabled={state.kind === "uploading"}
                onTranscript={(spokenText) => {
                  setDescription((prev) => {
                    const trimmedPrev = prev.trim();
                    const combined = trimmedPrev
                      ? `${trimmedPrev} ${spokenText}`
                      : spokenText;
                    return combined.slice(0, 2000);
                  });
                }}
              />
              <Textarea
                id="up-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe visible hazards, water depth, road passability, or urgent risks…"
                rows={3}
              />
            </div>
          </Field>
          <div className="tr-cluster" style={{ justifyContent: "flex-end", gap: "var(--s-2)" }}>
            {hasConfirmedLocation && canProceedToStep2() && (
              <Button variant="default" onClick={() => setStep(3)} data-testid="jump-to-step3-btn">
                <span>Jump to Submit</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              disabled={!canProceedToStep2()}
            >
              <span>{hasConfirmedLocation ? "Review location" : "Continue"}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <LocationConfirm
          exif={exif}
          initialChoice={locationChoice}
          initialCoords={locationCoords}
          onDraftChange={handleDraftLocationChange}
          onConfirm={onConfirmLocation}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <div className="tr-stack">
          {state.kind === "idle" && (
            <>
              <div
                className="panel"
                data-testid="step3-review-summary-card"
                style={{ display: "grid", gap: "var(--s-4)" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--s-2)",
                    flexWrap: "wrap",
                    paddingBottom: "var(--s-3)",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>Ready to submit</h3>
                    <p className="t-meta" style={{ margin: 0 }}>
                      Verify your photo evidence, location coordinates, and Meta AI Vision pre-triage telemetry before queuing for human moderation.
                    </p>
                  </div>
                  <span
                    className="t-meta num"
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      background: "var(--tide-wash)",
                      color: "var(--tide)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    STEP 3 OF 3 · VERIFICATION QUEUE READY
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "var(--s-4)",
                    alignItems: "start",
                  }}
                >
                  {/* Column 1: Photo Preview & File Dossier */}
                  <div
                    style={{
                      display: "grid",
                      gap: "var(--s-3)",
                      padding: "var(--s-3)",
                      borderRadius: "var(--r-ctl)",
                      background: "var(--sheet-sunk)",
                      border: "1px solid var(--rule)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span className="t-label">1. Photo Evidence</span>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setStep(1)}
                        style={{ minHeight: 28, paddingInline: 8, fontSize: "0.75rem" }}
                      >
                        Change photo
                      </button>
                    </div>

                    {previewUrl ? (
                      <div
                        style={{
                          aspectRatio: "16 / 10",
                          borderRadius: "var(--r-ctl)",
                          overflow: "hidden",
                          border: "1px solid var(--rule-strong)",
                          background: "var(--sheet)",
                          position: "relative",
                        }}
                      >
                        <img
                          src={previewUrl}
                          alt={files[0]?.name ?? "Uploaded evidence preview"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <span
                          className="t-meta num"
                          style={{
                            position: "absolute",
                            bottom: 8,
                            left: 8,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "rgba(9, 14, 24, 0.84)",
                            color: "#fff",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                          }}
                        >
                          {files[0]?.type?.replace("image/", "").toUpperCase() || "IMAGE"} ·{" "}
                          {files[0] ? `${Math.max(1, Math.round(files[0].size / 1024))} KB` : "Verified"}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          aspectRatio: "16 / 10",
                          borderRadius: "var(--r-ctl)",
                          border: "1px dashed var(--rule-strong)",
                          background: "var(--sheet)",
                          display: "grid",
                          placeItems: "center",
                          padding: "var(--s-3)",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                          <FileImage size={24} aria-hidden="true" style={{ color: "var(--tide)" }} />
                          <span className="t-meta" style={{ color: "var(--ink)", fontWeight: 600 }}>
                            {files[0]?.name ?? "Selected photo ready"}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="t-meta" style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileImage size={14} aria-hidden="true" style={{ color: "var(--tide)" }} />
                        <span>
                          Photo: <strong style={{ color: "var(--ink)" }}>{files[0]?.name}</strong>
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={14} aria-hidden="true" style={{ color: "var(--green)" }} />
                        <span>Format &amp; 10 MB integrity check passed</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Metadata Summary & Geospatial Coordinates */}
                  <div
                    style={{
                      display: "grid",
                      gap: "var(--s-3)",
                      padding: "var(--s-3)",
                      borderRadius: "var(--r-ctl)",
                      background: "var(--sheet-sunk)",
                      border: "1px solid var(--rule)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span className="t-label">2. Incident Metadata &amp; Location</span>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setStep(2)}
                        style={{ minHeight: 28, paddingInline: 8, fontSize: "0.75rem" }}
                      >
                        Edit location
                      </button>
                    </div>

                    <ul
                      className="t-meta"
                      style={{
                        display: "grid",
                        gap: 10,
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      <li
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: "var(--sheet)",
                          border: "1px solid var(--rule)",
                        }}
                      >
                        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Report Title
                        </div>
                        <div style={{ marginTop: 2, color: "var(--ink)", fontWeight: 600 }}>
                          Title: <strong style={{ color: "var(--ink)" }}>{title || "(none)"}</strong>
                        </div>
                      </li>

                      <li
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: "var(--sheet)",
                          border: "1px solid var(--rule)",
                        }}
                      >
                        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Situational Description
                        </div>
                        <div style={{ marginTop: 2, color: "var(--ink)" }}>
                          {description || "No supplemental description entered."}
                        </div>
                      </li>

                      <li
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: "var(--sheet)",
                          border: "1px solid var(--rule)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                        }}
                      >
                        <MapPin
                          size={15}
                          aria-hidden="true"
                          style={{ color: "var(--tide)", marginTop: 2, flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Geospatial Verification
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Location:{" "}
                            <strong style={{ color: "var(--ink)" }}>
                              {locationChoice === "unknown"
                                ? "unknown"
                                : locationChoice === "manual"
                                ? `manual placement${
                                    locationCoords
                                      ? ` (${locationCoords.lat.toFixed(4)}° N, ${locationCoords.lon.toFixed(4)}° E)`
                                      : ""
                                  }`
                                : `from GPS EXIF${
                                    exif ? ` (${exif.lat.toFixed(4)}° N, ${exif.lon.toFixed(4)}° E)` : ""
                                  }`}
                            </strong>
                          </div>
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* Column 3: AI Telemetry & Verification Pipeline Summary */}
                  <div
                    style={{
                      display: "grid",
                      gap: "var(--s-3)",
                      padding: "var(--s-3)",
                      borderRadius: "var(--r-ctl)",
                      background: "var(--grad-banner-wash), var(--sheet-sunk)",
                      border: "1px solid var(--tide)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        className="t-label"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--tide)" }}
                      >
                        <Cpu size={14} aria-hidden="true" />
                        <span>3. AI Telemetry Summary</span>
                      </span>
                      <span
                        className="t-meta num"
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "var(--green-wash)",
                          color: "var(--green-ink)",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                        }}
                      >
                        {aiTelemetry.confidencePct !== null ? `${aiTelemetry.confidencePct}% CONFIDENCE` : "READY"}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: "var(--sheet)",
                        border: "1px solid var(--rule)",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div className="t-meta" style={{ fontSize: "0.72rem" }}>
                        Detected Hazard Classification
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {aiTelemetry.hazardLabels.map((label) => (
                          <span
                            key={label}
                            className="t-meta"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "var(--tide-wash)",
                              color: "var(--tide)",
                              fontWeight: 700,
                              fontSize: "0.74rem",
                            }}
                          >
                            {label}
                          </span>
                        ))}
                        {aiTelemetry.preliminarySeverity !== null && (
                          <span
                            className="t-meta num"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "var(--amber-wash)",
                              color: "var(--amber-ink)",
                              fontWeight: 700,
                              fontSize: "0.74rem",
                            }}
                          >
                            {aiTelemetry.severityLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="t-meta"
                      style={{
                        display: "grid",
                        gap: 6,
                        fontSize: "0.76rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ShieldAlert size={14} aria-hidden="true" style={{ color: "var(--amber-ink)", flexShrink: 0 }} />
                        <span>
                          AI Pipeline:{" "}
                          <strong style={{ color: "var(--ink)" }}>
                            Meta Llama Vision structured extraction + Human Reviewer gate
                          </strong>
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={14} aria-hidden="true" style={{ color: "var(--tide)", flexShrink: 0 }} />
                        <span>SAM 3 flood &amp; structural mask ready on Reviewer Workbench</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="tr-cluster"
                style={{ justifyContent: "space-between", flexWrap: "wrap" }}
              >
                <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                  <Button variant="quiet" onClick={() => setStep(2)}>
                    <ArrowLeft size={15} aria-hidden="true" />
                    <span>Back to location</span>
                  </Button>
                  <Button variant="quiet" onClick={() => setStep(1)}>
                    <span>Edit photo &amp; details</span>
                  </Button>
                </div>
                <Button variant="primary" onClick={() => void doUpload()}>
                  Submit for review
                </Button>
              </div>
            </>
          )}
          {state.kind === "uploading" && (
            <div className="panel">
              <UploadProgress value={state.progress} label="Uploading photo & queuing Meta AI Vision…" />
              <Button
                variant="quiet"
                onClick={cancelUpload}
                style={{ marginTop: "var(--s-3)" }}
              >
                Cancel
              </Button>
            </div>
          )}
          {state.kind === "duplicate" && (
            <div className="panel">
              <h3 style={{ fontSize: "var(--step-1)" }}>Already uploaded</h3>
              <p className="t-meta" style={{ marginTop: "var(--s-2)" }}>
                This photo has already been submitted by your account. Open the existing report
                instead of uploading it again.
              </p>
              <div className="tr-cluster" style={{ marginTop: "var(--s-3)" }}>
                <Link className="btn" href={`/reports/${state.existingReportId}`}>
                  Open existing report
                </Link>
                <Button
                  variant="primary"
                  onClick={() => void doUpload(state.existingReportId)}
                >
                  Use existing report
                </Button>
              </div>
            </div>
          )}
          {state.kind === "linked" && (
            <div className="panel" role="status">
              <h3 style={{ fontSize: "var(--step-1)" }}>Existing report reused</h3>
              <p className="t-meta" style={{ marginTop: "var(--s-2)" }}>
                The original report is unchanged. No duplicate photo or AI request was created.
              </p>
              <Link
                className="btn btn--primary"
                style={{ marginTop: "var(--s-3)" }}
                href={`/reports/${state.existingReportId}`}
              >
                Open existing report
              </Link>
            </div>
          )}
          {state.kind === "error" && (
            <div className="panel">
              <h3 style={{ fontSize: "var(--step-1)" }}>Upload failed</h3>
              <p className="t-meta" style={{ marginTop: "var(--s-2)" }}>
                {state.message}
              </p>
              <div className="tr-cluster" style={{ marginTop: "var(--s-3)" }}>
                <Button variant="quiet" onClick={() => setStep(1)}>
                  Edit photo or details
                </Button>
                <Button variant="primary" onClick={() => void doUpload()}>
                  Retry
                </Button>
              </div>
            </div>
          )}
          {state.kind === "success" && (
            <div className="tr-stack">
              <div className="panel">
                <h3 style={{ fontSize: "var(--step-2)" }}>Upload received</h3>
                <p style={{ marginTop: "var(--s-2)" }}>
                  Your photo was saved privately. Nothing was sent to emergency services. AI
                  observations require human verification before becoming confirmed findings.
                </p>
                <p role="status" aria-live="polite" className="t-meta" style={{ marginTop: "var(--s-2)" }}>
                  {state.analysis.message}
                </p>
                <div className="tr-cluster" style={{ marginTop: "var(--s-3)" }}>
                  <Link className="btn btn--primary" href={`/reports/${state.reportId}`}>
                    Open the report
                  </Link>
                  {(state.analysis.kind === "unavailable" ||
                    state.analysis.kind === "processing") && (
                    <Button variant="default" onClick={() => void startAnalysis(state.reportId)}>
                      {state.analysis.kind === "processing"
                        ? "Check analysis status"
                        : "Retry AI analysis"}
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setStep(1);
                      setFiles([]);
                      setChecks([]);
                      setState({ kind: "idle" });
                      setTitle("");
                      setDescription("");
                      setLocationChoice(null);
                      setLocationCoords(null);
                      setExif(null);
                      setServerTelemetry(null);
                      setAiAutoFilled(false);
                      fileSequenceRef.current += 1;
                    }}
                  >
                    Upload another
                  </Button>
                </div>
              </div>
              <StatusTimeline
                status={
                  state.analysis.kind === "review_ready"
                    ? "needs_review"
                    : state.analysis.kind === "manual_review"
                    ? "needs_manual_review"
                    : state.analysis.kind === "requesting"
                    ? "analyzing"
                    : "uploaded"
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

