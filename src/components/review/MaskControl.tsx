"use client";

import { useRef, useState } from "react";
import { Segmented } from "@/components/ui-tr/Segmented";
import { cn } from "@/lib/utils";
import type { RealMaskOverlay } from "./RealSamMaskCanvas";

export type SamOverlay = RealMaskOverlay;

export interface MaskControlProps {
  reportId: string;
  analysisTarget: string | null;
  samAvailable: boolean;
  status?: string;
  canRequest?: boolean;
  unavailableReason?: string | null;
  initialOverlay?: SamOverlay | null;
  onMask?: (overlay: SamOverlay | null) => void;
  onOpacity?: (opacity: number) => void;
  onToggle?: (visible: boolean) => void;
  className?: string;
}

function isValidOverlay(value: unknown): value is SamOverlay {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<SamOverlay>;
  return x.format === "meta-sam-mask-v1" &&
    Array.isArray(x.masks) && x.masks.length > 0 &&
    Number.isInteger(x.image_width) && Number.isInteger(x.image_height) &&
    typeof x.model_id === "string";
}

export function MaskControl({
  reportId, analysisTarget, samAvailable, status,
  canRequest = false, unavailableReason = null,
  initialOverlay = null, onMask, onOpacity, onToggle, className,
}: MaskControlProps) {
  const [target, setTarget] = useState(analysisTarget ?? "");
  const [streaming, setStreaming] = useState(false);
  const [overlay, setOverlay] = useState<SamOverlay | null>(
    isValidOverlay(initialOverlay) ? initialOverlay : null);
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(45);
  const [error, setError] = useState<string | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const eligibleStatus = status === "needs_review" ||
    status === "reviewed" || status === "needs_manual_review";
  const permitted = samAvailable && canRequest && eligibleStatus;
  const hasTarget = target.trim().length >= 2 && target.trim().length <= 100;
  const reason = !samAvailable
    ? "SAM is not configured. The photograph and human review remain available."
    : !canRequest
      ? unavailableReason ?? "You are not authorized to request segmentation for this report."
      : !eligibleStatus
        ? "This report is not ready for reviewer-guided segmentation."
        : null;

  async function handleRequest() {
    if (!permitted || !hasTarget || streaming || inFlightRef.current) return;
    inFlightRef.current = true;
    setStreaming(true);
    setError(null);
    setInfo(null);
    setRetryAllowed(false);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const response = await fetch(`/api/reports/${reportId}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: target.trim() }),
        signal: ctrl.signal,
      });
      const body: unknown = await response.json();
      const result = body && typeof body === "object"
        ? body as { ok?: boolean; overlay?: unknown; kind?: string;
            error?: { code?: string; message?: string } | string } : {};
      if (response.ok && result.ok && isValidOverlay(result.overlay)) {
        setOverlay(result.overlay);
        setVisible(true);
        onMask?.(result.overlay);
        onToggle?.(true);
        setInfo("Validated SAM mask saved. AI-generated pixels are not verified proof of damage.");
      } else if (response.ok && result.kind === "no_match") {
        setInfo("SAM did not find a matching object. No new mask was created. The report remains reviewable.");
      } else {
        const msg = typeof result.error === "string" ? result.error :
          result.error?.message ?? "Segmentation is unavailable. You can review the photo without it.";
        setError(msg);
        // Only transient service/network failures may be explicitly retried.
        // Permanent 403, 409, invalid-state, missing-analysis and budget errors
        // must not offer a pointless re-submit (or incur a second paid call).
        setRetryAllowed(response.status >= 500);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Network connection failed. Your saved report and reviewer decisions are unaffected.");
      setRetryAllowed(true);
    } finally {
      if (!ctrl.signal.aborted) setStreaming(false);
      inFlightRef.current = false;
    }
  }

  function handleOpacityChange(value: number) {
    setOpacity(value);
    onOpacity?.(value / 100);
  }

  function handleVisibleChange(value: boolean) {
    setVisible(value);
    onToggle?.(value);
  }

  return <section className={cn("mask-control min-w-0", className)}
    data-testid="mask-control" data-state={streaming ? "streaming" : overlay ? "ready" : "idle"}
    aria-label="Optional reviewer-guided SAM segmentation">
    <div className="grid min-w-0 gap-2">
      <label htmlFor="sam-mask-target" className="field__label">Mask target</label>
      <input id="sam-mask-target" className="input min-h-11 min-w-0 w-full"
        value={target} onChange={(event) => {
          setTarget(event.target.value);
          setError(null); setRetryAllowed(false);
        }}
        maxLength={100} disabled={!permitted || streaming}
        placeholder="e.g. damaged building, fallen debris" />
      <p className="m-0 text-xs text-[var(--ink-2)]">
        {status === "needs_manual_review"
          ? "Muse analysis was unavailable. An independent reviewer may optionally request a SAM mask using a specific target. This does not verify or classify the report."
          : "Optional paid SAM 3.1 segmentation. Enter a concrete visible object; no automatic model calls are made."}
      </p>
    </div>
    <button type="button" className="btn btn--primary min-h-11"
      aria-busy={streaming || undefined} disabled={!permitted || !hasTarget || streaming}
      onClick={() => void handleRequest()}>
      {streaming ? "Generating mask…" : overlay ? "Generate another mask" : "Generate optional mask"}
    </button>
    {reason && <p role="status" className="m-0 text-sm text-[var(--ink-2)] [grid-column:1/-1]">{reason}</p>}
    {streaming && <div aria-hidden="true" className="mask-control__bar [grid-column:1/-1] motion-reduce:animate-none" />}
    {info && <p role="status" className="m-0 text-sm text-[var(--ink-2)] [grid-column:1/-1]">{info}</p>}
    {error && <div role="alert" className="grid gap-2 rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-3 [grid-column:1/-1]">
      <p className="m-0 break-words text-sm text-ink">{error}</p>
      {retryAllowed && <button type="button" className="btn btn--quiet min-h-11 justify-self-start"
        onClick={() => void handleRequest()} disabled={streaming}>Try again (optional)</button>}
    </div>}
    {overlay && <div className="grid min-w-0 gap-3 [grid-column:1/-1]">
      <p role="status" className="m-0 text-xs text-[var(--ink-2)]">
        {overlay.masks.length} real decoded mask(s). {overlay.score == null
          ? "Model confidence was not supplied." : `Highest reported confidence: ${Math.round(overlay.score * 100)}%.`}
        {" "}AI-generated region; not verified proof of damage.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1">
          <span className="field__label">Mask visibility</span>
          <Segmented<string> aria-label="Mask visibility" block
            options={[{ value: "on", label: "Show" }, { value: "off", label: "Hide" }]}
            value={visible ? "on" : "off"}
            onChange={(value) => handleVisibleChange(value === "on")} />
        </label>
        <label className="grid min-w-0 gap-1">
          <span className="field__label">Mask opacity: {opacity}%</span>
          <input type="range" min={0} max={100} step={5} value={opacity}
            onChange={(event) => handleOpacityChange(Number(event.target.value))}
            aria-label="Mask opacity" className="min-h-11 w-full" />
        </label>
      </div>
    </div>}
  </section>;
}
