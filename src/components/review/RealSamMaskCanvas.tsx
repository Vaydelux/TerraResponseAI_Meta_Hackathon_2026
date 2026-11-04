"use client";

import { useEffect, useRef, useState } from "react";
import { decodeMaskToRaster } from "@/lib/vendor/meta-sam/mask-codec";
import type { SamStoredMask } from "@/lib/ai/sam-protocol";

export interface RealMaskOverlay {
  format: "meta-sam-mask-v1";
  masks: SamStoredMask[];
  image_width: number;
  image_height: number;
  model_id: string;
  prompt: string;
  score: number | null;
  ai_generated: true;
}

interface RealSamMaskCanvasProps {
  overlay: RealMaskOverlay;
  opacity: number;
  visible: boolean;
}

/** Real decoded SAM pixels only. Never paint a placeholder region.
 * Dimensions and mask bounds are in the model image's source pixels.
 * CSS positions the canvas inside the image's object-contain rectangle,
 * which also participates in the viewer's pan/zoom transform.
 */
export function RealSamMaskCanvas({ overlay, opacity, visible }: RealSamMaskCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stage = canvas.parentElement;
    if (!stage) return;
    const sourceW = overlay.image_width, sourceH = overlay.image_height;
    const valid = overlay.format === "meta-sam-mask-v1" &&
      Number.isInteger(sourceW) && Number.isInteger(sourceH) &&
      sourceW > 0 && sourceH > 0 && sourceW * sourceH <= 28_000_000 &&
      Array.isArray(overlay.masks) && overlay.masks.length > 0 && overlay.masks.length <= 24;
    if (!valid) {
      queueMicrotask(() => setInvalid(true));
      return;
    }
    const activeCanvas = canvas;
    const context = activeCanvas.getContext("2d");
    if (!context) { queueMicrotask(() => setInvalid(true)); return; }
    activeCanvas.width = sourceW;
    activeCanvas.height = sourceH;
    function position() {
      if (!stage) return;
      const width = stage.clientWidth, height = stage.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(width / sourceW, height / sourceH);
      const paintedW = sourceW * scale, paintedH = sourceH * scale;
      activeCanvas.style.width = paintedW + "px";
      activeCanvas.style.height = paintedH + "px";
      activeCanvas.style.left = (width - paintedW) / 2 + "px";
      activeCanvas.style.top = (height - paintedH) / 2 + "px";
    }
    position();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(position) : null;
    observer?.observe(stage);
    try {
      context.clearRect(0, 0, sourceW, sourceH);
      for (const record of overlay.masks) {
        const { mask, bounds } = record;
        if (mask.width <= 0 || mask.height <= 0 || mask.width * mask.height > 4_000_000 ||
          bounds.left < 0 || bounds.top < 0 ||
          bounds.right > sourceW || bounds.bottom > sourceH ||
          bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
          throw new Error("invalid model geometry");
        }
        const raster = decodeMaskToRaster(mask);
        if (raster.length !== mask.width * mask.height) throw new Error("invalid raster size");
        const offscreen = document.createElement("canvas");
        offscreen.width = mask.width;
        offscreen.height = mask.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        const pixels = ctx.createImageData(mask.width, mask.height);
        for (let i = 0; i < raster.length; i++) {
          if (raster[i] !== 1) continue;
          const offset = i * 4;
          pixels.data[offset] = 21;
          pixels.data[offset + 1] = 172;
          pixels.data[offset + 2] = 209;
          pixels.data[offset + 3] = 180;
        }
        ctx.putImageData(pixels, 0, 0);
        context.drawImage(offscreen, bounds.left, bounds.top,
          bounds.right - bounds.left, bounds.bottom - bounds.top);
        context.strokeStyle = "rgba(21,172,209,0.85)";
        context.lineWidth = Math.max(1.5, sourceW / 500);
        context.strokeRect(bounds.left, bounds.top,
          bounds.right - bounds.left, bounds.bottom - bounds.top);
      }
      queueMicrotask(() => setInvalid(false));
    } catch {
      // Any malformed record invalidates the entire overlay. Paint nothing.
      context.clearRect(0, 0, sourceW, sourceH);
      queueMicrotask(() => setInvalid(true));
    }
    return () => observer?.disconnect();
  }, [overlay]);

  if (!Array.isArray(overlay.masks) || overlay.masks.length === 0) return null;
  return <>
    <canvas ref={ref} data-testid="real-sam-mask" aria-hidden="true"
      className="pointer-events-none absolute z-[1]"
      style={{ opacity: !invalid && visible ? opacity : 0,
        transition: "opacity 180ms ease-out" }} />
    {invalid && <span role="status" className="absolute bottom-4 left-4 z-20 rounded-ctl border border-[var(--amber)] bg-sheet p-2 text-xs text-ink">
      Stored segmentation could not be decoded. No mask has been displayed.
    </span>}
  </>;
}
