// src/components/upload/UploadProgress.tsx
//
// A simple progress bar during upload. The `.viewer__chip`-style
// track fills with the tide color. Used inside the UploadFlow's
// third step (the upload itself).

import { cn } from "@/lib/utils";

export interface UploadProgressProps {
  /** 0–100. */
  value: number;
  label?: string;
  className?: string;
}

export function UploadProgress({ value, label, className }: UploadProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("upload-progress", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      {label && <div className="t-label">{label}</div>}
      <div className="upload-progress__bar" aria-hidden="true">
        <span className="upload-progress__fill" style={{ width: `${v}%` }} />
      </div>
      <div className="t-meta num">{v}%</div>
    </div>
  );
}
