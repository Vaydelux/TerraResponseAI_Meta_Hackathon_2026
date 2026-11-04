// src/components/review/EvidenceViewer.tsx
//
// The photo viewer with pan/zoom/mask. This is the LEFT side of the
// review workbench; the photo is larger than the AI observation and
// sits on top on mobile (per design thesis "Evidence first, AI
// second").
//
// Behavior (per the brief):
//   - Fetches a 60-second signed URL from `/api/reports/[id]/evidence?kind=derivative` on mount.
//   - Refreshes the signed URL on `visibilitychange` and on image error (1s debounce).
//   - Wheel + pinch zoom (clamp 1x to 8x), drag pan (cursor: grab/grabbing).
//   - Chrome: top-left = location chip (clicking opens LocationConfirm for contributors);
//     top-right = zoom controls (- / 100% / +); a "fit" toggle.
//   - MaskControl rendered below the image (separate component).
//   - Shows a `.viewer__chip--amber` "Unverified" chip in the top-left when the report's state is pending.
//   - If retentionState is 'soft_deleted' or 'purged', show a 410 GONE message instead of the image.
//   - Keyboard: arrow keys pan, +/- zoom, 0 fit, M toggle mask.
//
// Client component — manages zoom/pan state + the signed URL lifecycle.

"use client";

import { useEffect, useRef, useState } from "react";
import { MaskControl, type SamOverlay } from "./MaskControl";
import { RealSamMaskCanvas } from "./RealSamMaskCanvas";
import { SealBadge } from "@/components/seal/SealBadge";
import { stateFromReport } from "@/lib/design/status";
import { formatCoords } from "@/lib/design/format";
import { COPY } from "@/lib/design/copy";
import { cn } from "@/lib/utils";

export interface EvidenceViewerProps {
  reportId: string;
  derivativeStorageKey: string;
  location: { lat: number; lon: number; source: string; label?: string } | null;
  imageWidth?: number;
  imageHeight?: number;
  altText: string;
  retentionState: "active" | "soft_deleted" | "purged";
  isContributor: boolean;
  status: string;
  reviewOutcome: string | null;
  analysisTarget?: string | null;
  samAvailable?: boolean;
  canRequestSegmentation?: boolean;
  segmentationUnavailableReason?: string | null;
  initialOverlay?: SamOverlay | null;
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

export function EvidenceViewer({
  reportId,
  derivativeStorageKey,
  location,
  altText,
  retentionState,
  isContributor,
  status,
  reviewOutcome,
  analysisTarget = null,
  samAvailable = false,
  canRequestSegmentation = false,
  segmentationUnavailableReason = null,
  initialOverlay = null,
  className,
}: EvidenceViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<null | { x: number; y: number; ox: number; oy: number }>(null);
  const [maskOpacity, setMaskOpacity] = useState(0.45);
  const [maskVisible, setMaskVisible] = useState(true);
  const [receivedOverlay, setReceivedOverlay] = useState<{ reportId: string; value: SamOverlay } | null>(null);
  const displayedOverlay = receivedOverlay?.reportId === reportId
    ? receivedOverlay.value : initialOverlay;
  const viewerRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  // The seal state for the "Unverified" chip + the chip text.
  const state = stateFromReport({ status, reviewOutcome: reviewOutcome });
  const isPending = state === "pending";

  // Fetch the signed URL on mount + on visibilitychange + on error.
  useEffect(() => {
    if (retentionState !== "active") return;
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;

    function refresh() {
      if (controller.signal.aborted) return;
      fetch(`/api/reports/${reportId}/evidence?kind=derivative`)
        .then((r) => r.json())
        .then((body) => {
          if (controller.signal.aborted) return;
          if (body?.ok && body.signedUrl) {
            setSignedUrl(body.signedUrl);
            setUrlError(null);
          } else if (body?.error?.code === "SOFT_DELETED" || body?.error?.code === "PURGED") {
            setUrlError("This report's evidence was requested for deletion.");
          } else if (body?.error) {
            setUrlError(body.error.message ?? "Could not load photo.");
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError") && !controller.signal.aborted) {
            setUrlError("Network error while loading the photo.");
          }
        });
    }

    refresh();
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(refresh, 1000);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [reportId, retentionState]);

  function handleImageError() {
    // The signed URL likely expired — refresh after a 1s debounce.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      fetch(`/api/reports/${reportId}/evidence?kind=derivative`, { signal: controller.signal })
        .then((r) => r.json())
        .then((body) => {
          if (!controller.signal.aborted && body?.ok && body.signedUrl) {
            setSignedUrl(body.signedUrl);
            toast(COPY.signedUrlExpired);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (requestAbortRef.current === controller) requestAbortRef.current = null;
        });
    }, 1000);
  }

  function setZoomAroundCenter(next: number) {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }

  function onWheel(e: React.WheelEvent) {
    if (!signedUrl) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoomAroundCenter(zoom * (1 + delta));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!signedUrl) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setPan({
      x: dragging.ox + (e.clientX - dragging.x),
      y: dragging.oy + (e.clientY - dragging.y),
    });
  }

  function onPointerUp() {
    setDragging(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const step = 24;
    if (e.key === "ArrowUp") { setPan((p) => ({ ...p, y: p.y + step })); e.preventDefault(); }
    else if (e.key === "ArrowDown") { setPan((p) => ({ ...p, y: p.y - step })); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { setPan((p) => ({ ...p, x: p.x + step })); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setPan((p) => ({ ...p, x: p.x - step })); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { setZoomAroundCenter(zoom + ZOOM_STEP); e.preventDefault(); }
    else if (e.key === "-" || e.key === "_") { setZoomAroundCenter(zoom - ZOOM_STEP); e.preventDefault(); }
    else if (e.key === "0") { setZoomAroundCenter(1); e.preventDefault(); }
    else if (e.key === "m" || e.key === "M") { setMaskVisible((v) => !v); e.preventDefault(); }
  }

  if (retentionState !== "active") {
    return (
      <div className={cn("viewer", className)} role="img" aria-label="Evidence purged">
        <div className="viewer__loading">
          <div style={{ display: "grid", gap: 8, padding: 24, textAlign: "center", color: "var(--ink-inverse)" }}>
            <strong>410 Gone</strong>
            <span>
              {retentionState === "purged"
                ? "This report's evidence has been purged from storage."
                : "This report's evidence was requested for deletion. Signed URLs are no longer issued."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const coords = location ? formatCoords(location.lat, location.lon) : null;

  return (
    <div className="tr-stack">
      <div
        ref={viewerRef}
        className={cn("viewer", className)}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="img"
        aria-label={altText}
      >
        <div
          className="viewer__stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {signedUrl ? (
            <img
              className="viewer__img"
              src={signedUrl}
              alt={altText}
              draggable={false}
              onError={handleImageError}
            />
          ) : (
            <div className="viewer__loading">
              {urlError ? <span>{urlError}</span> : <span>Loading photo…</span>}
            </div>
          )}
          {displayedOverlay && signedUrl && (
            <RealSamMaskCanvas
              overlay={displayedOverlay}
              opacity={maskOpacity}
              visible={maskVisible}
            />
          )}
        </div>
        <div className="viewer__chrome viewer__chrome--tl">
          {isPending && (
            <span className="viewer__chip viewer__chip--amber">
              <SealBadge state={state} />
            </span>
          )}
          {coords && (
            <span className="viewer__chip" title="Coordinates from EXIF or manual placement">
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
                <path d="M6 1c-2.2 0-4 1.8-4 4 0 3 4 6 4 6s4-3 4-6c0-2.2-1.8-4-4-4Z" />
                <circle cx={6} cy={5} r={1.3} fill="currentColor" stroke="none" />
              </svg>
              <span className="num">{coords}</span>
            </span>
          )}
        </div>
        <div className="viewer__chrome viewer__chrome--tr">
          <div className="viewer__zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              onClick={() => setZoomAroundCenter(zoom - ZOOM_STEP)}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoomAroundCenter(1)}
              aria-label="Fit to screen"
              className="num"
              style={{ fontSize: 12 }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoomAroundCenter(zoom + ZOOM_STEP)}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>
          <MaskControl
            key={reportId}
            reportId={reportId}
        analysisTarget={analysisTarget}
        samAvailable={samAvailable}
        status={status}
        canRequest={canRequestSegmentation}
        unavailableReason={segmentationUnavailableReason}
        initialOverlay={displayedOverlay}
        onMask={(next) => {
          if (next) setReceivedOverlay({ reportId, value: next });
          else setReceivedOverlay(null);
        }}
        onOpacity={(o) => setMaskOpacity(o)}
        onToggle={(v) => setMaskVisible(v)}
      />
    </div>
  );
}

// Tiny inline toast — avoids importing the toast region (which is
// mounted once at the layout level). Just calls the toast emitter.
function toast(message: string) {
  // The Toast module's toast.push is the canonical API; we use it
  // for the signed-url-expired notice.
  // Imported lazily here to avoid a circular dep at module load.
  import("@/components/ui-tr/Toast")
    .then((m) => m.toast.push({ message, kind: "default" }))
    .catch(() => undefined);
}
