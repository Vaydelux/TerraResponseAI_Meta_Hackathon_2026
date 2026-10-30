"use client";

// src/components/terra/segmentation-overlay.tsx
//
// Renders a SAM 3.1 segmentation mask overlay on top of the
// derivative image. Per the brief:
//   - "Render masks/boxes aligned with the image dimensions and allow
//     the reviewer to toggle original versus highlighted overlay."
//   - "Mark overlays as AI-generated regions, not verified proof of
//     damage."
//
// The RLE mask is decoded client-side (the RLE format from SAM is a
// compact run-length encoding). The overlay is rendered on a <canvas>
// positioned on top of the <img>.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, AlertTriangle, Loader2, ScanEye } from "lucide-react";

export interface OverlayData {
  rle: string;
  score: number;
  box: { cx: number; cy: number; w: number; h: number } | null;
  image_width: number;
  image_height: number;
  model_id: string;
  prompt: string;
  ai_generated: boolean;
}

interface SegmentationOverlayProps {
  /** The signed URL of the derivative image. */
  imageUrl: string;
  /** The stored overlay data (from GET /api/reports/[id]/segment). */
  overlay: OverlayData | null;
  /** Whether SAM is configured (if not, the "Generate mask" button is hidden). */
  samConfigured: boolean;
  /** Callback to request a new segmentation. */
  onRequestSegment: () => void;
  /** Whether a segmentation request is in progress. */
  loading: boolean;
  /** Error from the last segmentation attempt (null = no error). */
  error: string | null;
}

export function SegmentationOverlay({
  imageUrl,
  overlay,
  samConfigured,
  onRequestSegment,
  loading,
  error,
}: SegmentationOverlayProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Decode the RLE mask and draw it on the canvas.
  useEffect(() => {
    if (!overlay || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set the canvas to match the image's rendered size.
    const renderWidth = img.clientWidth;
    const renderHeight = img.clientHeight;
    canvas.width = renderWidth;
    canvas.height = renderHeight;

    // Decode the RLE mask. SAM RLE is a string of space-separated
    // runs: "count1 count2 count3..." where alternating runs are
    // background/foreground. The mask dimensions match the image.
    const maskWidth = overlay.image_width || renderWidth;
    const maskHeight = overlay.image_height || renderHeight;
    const runs = overlay.rle.split(/\s+/).map(Number);
    const maskData = ctx.createImageData(renderWidth, renderHeight);

    // Scale the mask to the rendered size.
    let pixelIdx = 0;
    let isForeground = false;
    for (const run of runs) {
      for (let i = 0; i < run; i++) {
        if (pixelIdx >= maskWidth * maskHeight) break;
        // Scale to rendered dimensions.
        const srcX = pixelIdx % maskWidth;
        const srcY = Math.floor(pixelIdx / maskWidth);
        const dstX = Math.floor((srcX / maskWidth) * renderWidth);
        const dstY = Math.floor((srcY / maskHeight) * renderHeight);

        if (isForeground && dstY < renderHeight && dstX < renderWidth) {
          const dstIdx = (dstY * renderWidth + dstX) * 4;
          // Semi-transparent red overlay.
          maskData.data[dstIdx] = 255;     // R
          maskData.data[dstIdx + 1] = 0;   // G
          maskData.data[dstIdx + 2] = 0;   // B
          maskData.data[dstIdx + 3] = 128; // A (50% opacity)
        }
        pixelIdx++;
      }
      isForeground = !isForeground;
    }

    ctx.putImageData(maskData, 0, 0);
  }, [overlay, showOverlay]);

  // Draw the bounding box if present.
  useEffect(() => {
    if (!overlay?.box || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { cx, cy, w, h } = overlay.box;
    const renderW = canvas.width;
    const renderH = canvas.height;
    // Box is normalized [cx, cy, w, h] in [0, 1].
    const x = (cx - w / 2) * renderW;
    const y = (cy - h / 2) * renderH;
    const bw = w * renderW;
    const bh = h * renderH;

    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
  }, [overlay, showOverlay]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanEye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">SAM 3.1 Segmentation Overlay</span>
          {overlay && (
            <Badge variant="outline" className="gap-1 text-[10px] text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              AI-generated region
            </Badge>
          )}
        </div>
        {overlay && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOverlay((v) => !v)}
          >
            {showOverlay ? (
              <><EyeOff className="mr-1.5 h-3.5 w-3.5" />Hide overlay</>
            ) : (
              <><Eye className="mr-1.5 h-3.5 w-3.5" />Show overlay</>
            )}
          </Button>
        )}
      </div>

      {/* Image + overlay canvas */}
      <div className="relative overflow-hidden rounded-lg border">
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Report derivative (EXIF stripped)"
          className="h-64 w-full object-cover"
        />
        {showOverlay && overlay && (
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 h-full w-full pointer-events-none"
          />
        )}
      </div>

      {/* Overlay metadata */}
      {overlay && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>Target: <span className="font-medium">{overlay.prompt}</span></div>
          <div>Score: {overlay.score.toFixed(3)} · Model: {overlay.model_id}</div>
          <div className="flex items-center gap-1 text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            This overlay is an AI-generated region, not verified proof of damage.
          </div>
        </div>
      )}

      {/* Action: generate overlay (opt-in) */}
      {!overlay && samConfigured && !loading && (
        <Button variant="outline" size="sm" onClick={onRequestSegment}>
          <ScanEye className="mr-1.5 h-3.5 w-3.5" />
          Generate segmentation overlay
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating overlay…
        </div>
      )}

      {/* Error / no-match (the report remains usable) */}
      {error && !loading && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {error} The report remains fully usable without the overlay.
          </span>
        </div>
      )}

      {/* SAM not configured */}
      {!overlay && !samConfigured && !loading && (
        <p className="text-xs text-muted-foreground">
          SAM 3.1 is not configured. Segmentation is skipped by default.
        </p>
      )}
    </div>
  );
}
