// src/components/review/MaskControl.tsx
//
// The SAM 3.1 opt-in segmentation control (components.css §7.4).
// Three states:
//
//   - default: a target text input + "Request mask" button. The
//     target prefills from the analysis's segmentation_target.
//   - streaming: a streaming bar animates below the inputs (the CSS
//     `.mask-control[data-state="streaming"]` rule).
//   - unavailable: collapses to a single graphite line ("SAM
//     segmentation unavailable. The rest of the report remains
//     usable.") when `samAvailable` is false.
//
// When a mask is present (returned by the /segment POST), an
// opacity slider (0–100%, default 45%) + a toggle is rendered. The
// opacity is exposed via the `onOpacity` callback so the
// EvidenceViewer can set `--mask-opacity` on its `.viewer__mask`
// element.
//
// Client component — manages the streaming state + the request.

"use client";

import { useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/ui-tr/Segmented";
import { toast } from "@/components/ui-tr/Toast";
import { cn } from "@/lib/utils";

export interface SamOverlay {
  rle: string;
  score: number;
  image_width: number;
  image_height: number;
  model_id: string;
  prompt: string;
}

export interface MaskControlProps {
  reportId: string;
  /** The target text prefilled from the analysis. */
  analysisTarget: string | null;
  /** False if SAM_API_KEY is unset. */
  samAvailable: boolean;
  /** An initial overlay if one is already stored (from GET /segment). */
  initialOverlay?: SamOverlay | null;
  /** Called when a mask is requested + received. */
  onMask?: (overlay: SamOverlay | null) => void;
  /** Called when the opacity slider changes. The EvidenceViewer
   *  uses this to set `--mask-opacity` on the `.viewer__mask`. */
  onOpacity?: (opacity: number) => void;
  /** Called when the mask is toggled on/off. */
  onToggle?: (visible: boolean) => void;
  className?: string;
}

export function MaskControl({
  reportId,
  analysisTarget,
  samAvailable,
  initialOverlay = null,
  onMask,
  onOpacity,
  onToggle,
  className,
}: MaskControlProps) {
  const [target, setTarget] = useState(analysisTarget ?? "");
  const [streaming, setStreaming] = useState(false);
  const [overlay, setOverlay] = useState<SamOverlay | null>(initialOverlay);
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(45);
  const abortRef = useRef<AbortController | null>(null);

  // When the parent passes a new initial overlay (e.g. the page
  // re-fetches after a navigation), sync it.
  useEffect(() => {
    setOverlay(initialOverlay);
    if (initialOverlay) {
      setVisible(true);
    }
  }, [initialOverlay]);

  async function handleRequest() {
    if (!samAvailable || streaming) return;
    setStreaming(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/reports/${reportId}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target || undefined }),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (body?.ok && body.overlay) {
        setOverlay(body.overlay);
        setVisible(true);
        onMask?.(body.overlay);
      } else if (!body?.ok) {
        const msg = body?.error?.message ?? "Segmentation failed.";
        toast.error(msg, {
          label: "Retry",
          onClick: () => {
            void handleRequest();
          },
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Network error while requesting the mask.");
    } finally {
      if (!ctrl.signal.aborted) setStreaming(false);
    }
  }

  function handleOpacityChange(next: number) {
    setOpacity(next);
    onOpacity?.(next / 100);
  }

  function handleVisibleChange(next: boolean) {
    setVisible(next);
    onToggle?.(next);
  }

  if (!samAvailable) {
    return (
      <div
        className={cn("mask-control", className)}
        data-state="unavailable"
        role="status"
      >
        <span>SAM segmentation unavailable. The rest of the report remains usable.</span>
      </div>
    );
  }

  return (
    <div
      className={cn("mask-control", className)}
      data-state={streaming ? "streaming" : overlay ? "ready" : "idle"}
    >
      <Field label="Mask target">
        <input
          className="input"
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="e.g. floodwater extent"
          aria-label="Mask target"
        />
      </Field>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => void handleRequest()}
        aria-busy={streaming || undefined}
        disabled={streaming}
      >
        {overlay ? "Re-request mask" : "Request mask"}
      </button>
      {streaming && <div className="mask-control__bar" aria-hidden="true" />}
      <div className="mask-control__status" aria-live="polite">
        {streaming && <span>Streaming mask from SAM 3.1…</span>}
        {!streaming && overlay && (
          <span>
            <span className="mask-control__swatch" aria-hidden="true" />
            Mask from SAM 3.1 (score {(overlay.score * 100).toFixed(0)}%). AI-generated region, not verified proof of damage.
          </span>
        )}
        {!streaming && !overlay && (
          <span>SAM 3.1 is optional. The rest of the report remains usable without it.</span>
        )}
      </div>
      {overlay && (
        <div className="mask-control__controls" style={{ gridColumn: "1 / -1", display: "grid", gap: 12 }}>
          <Field label="Mask visibility">
            <Segmented<string>
              aria-label="Mask visibility"
              block
              options={[
                { value: "on", label: "Show" },
                { value: "off", label: "Hide" },
              ]}
              value={visible ? "on" : "off"}
              onChange={(v) => handleVisibleChange(v === "on")}
            />
          </Field>
          <Field label={`Mask opacity — ${opacity}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => handleOpacityChange(Number(e.target.value))}
              aria-label="Mask opacity"
              style={{ width: "100%" }}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// Inline Field wrapper to avoid a circular import (Field is the same
// shape as the ui-tr Field, but the mask-control has its own grid
// layout). The ui-tr Field renders the `.field` block with label +
// control + hint; we want the same here without forcing the grid
// to adopt `.field`'s default width.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field" style={{ minWidth: 0 }}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
