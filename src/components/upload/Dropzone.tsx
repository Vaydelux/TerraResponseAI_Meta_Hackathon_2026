// src/components/upload/Dropzone.tsx
//
// The `.dropzone` (components.css §7.8). On mobile, the primary
// control is a full-width "Take photo" button above "Choose from
// library" — the brief's "On mobile, the primary control is a
// full-width 'Take photo' button above 'Choose from library'".
//
// Files are accepted as `image/jpeg` and `image/png` with
// `capture="environment"` for the camera. The drag-over state sets
// `data-drag="true"` (the CSS dims the border + tints the bg).
//
// Client component — manages the input + drag state.

"use client";

import { useRef, useState, type DragEvent } from "react";
import { Camera, FolderUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
  /** Called when the user selects files (drag or input). */
  onFiles: (files: File[]) => void;
  /** Disabled state — e.g. during upload. */
  disabled?: boolean;
  /** Hint text shown below the primary control. */
  hint?: string;
  className?: string;
}

export function Dropzone({ onFiles, disabled, hint = "JPG or PNG, up to 25 MB", className }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) onFiles(files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = ""; // reset so picking the same file again fires change
  }

  return (
    <div
      className={cn("dropzone", className)}
      data-drag={dragOver || undefined}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      aria-disabled={disabled || undefined}
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        onChange={handleInputChange}
        style={{ display: "none" }}
        aria-label="Choose photos from your library"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={handleInputChange}
        style={{ display: "none" }}
        aria-label="Take a photo"
      />
      <div style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%" }}>
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={(e) => {
            e.stopPropagation();
            cameraInputRef.current?.click();
          }}
          disabled={disabled}
        >
          <Camera size={18} aria-hidden="true" />
          Take photo
        </button>
        <button
          type="button"
          className="btn btn--block"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          disabled={disabled}
        >
          <FolderUp size={18} aria-hidden="true" />
          Choose from library
        </button>
        <p className="t-meta">{hint}</p>
      </div>
    </div>
  );
}
