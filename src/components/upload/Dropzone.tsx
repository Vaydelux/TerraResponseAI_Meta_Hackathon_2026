// src/components/upload/Dropzone.tsx
//
// Enhanced Dropzone with:
//   - Camera capture ("Take photo")
//   - File picker ("Choose from library")
//   - Clipboard paste ("Paste image" button + global Ctrl+V / Cmd+V listener)
//   - Rich selected photo thumbnail preview & "Change photo" button so
//     returning to Step 1 preserves and displays the chosen image clearly.

"use client";

import { useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import { Camera, FolderUp, ClipboardPaste, Image as ImageIcon, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
  /** Called when the user selects or pastes files. */
  onFiles: (files: File[]) => void;
  /** Currently selected file (for preview when returning to Step 1). */
  selectedFile?: File | null;
  /** Preview URL of the currently selected file. */
  previewUrl?: string | null;
  /** Disabled state — e.g. during upload. */
  disabled?: boolean;
  /** Hint text shown below the primary control. */
  hint?: string;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Dropzone({
  onFiles,
  selectedFile = null,
  previewUrl = null,
  disabled,
  hint = "JPG, PNG or WebP · Drag & drop, browse, or press Ctrl+V / Cmd+V to paste image · up to 10 MB",
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  // Global window paste handler so pressing Ctrl+V / Cmd+V anywhere on Step 1 pastes the image
  useEffect(() => {
    if (disabled) return;
    function onWindowPaste(e: globalThis.ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        const blob = imageItem.getAsFile();
        if (blob) {
          e.preventDefault();
          const ext = blob.type.split("/")[1] || "png";
          const namedFile =
            blob.name && blob.name !== "image.png"
              ? blob
              : new File([blob], `pasted-evidence-${Date.now().toString().slice(-5)}.${ext}`, {
                  type: blob.type || "image/png",
                });
          setPasteFeedback(`Pasted image (${namedFile.name}) from clipboard.`);
          onFiles([namedFile]);
          return;
        }
      }
      if (!isTextInput && e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const fileList = Array.from(e.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (fileList.length > 0) {
          e.preventDefault();
          setPasteFeedback(`Pasted image (${fileList[0].name}) from clipboard.`);
          onFiles(fileList.slice(0, 1));
        }
      }
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [disabled, onFiles]);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      setPasteFeedback(null);
      onFiles(files.slice(0, 1));
    }
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
    if (files.length > 0) {
      setPasteFeedback(null);
      onFiles(files.slice(0, 1));
    }
    e.target.value = ""; // reset so picking the same file again fires change
  }

  function handleContainerPaste(e: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const blob = imageItem.getAsFile();
      if (blob) {
        e.preventDefault();
        const ext = blob.type.split("/")[1] || "png";
        const namedFile = new File(
          [blob],
          `pasted-evidence-${Date.now().toString().slice(-5)}.${ext}`,
          { type: blob.type || "image/png" },
        );
        setPasteFeedback(`Pasted image (${namedFile.name}) from clipboard.`);
        onFiles([namedFile]);
      }
    }
  }

  async function handleClipboardButtonClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    setPasteFeedback(null);

    if (typeof navigator !== "undefined" && navigator.clipboard?.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find(
            (t) => t === "image/png" || t === "image/jpeg" || t === "image/webp",
          );
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split("/")[1] || "png";
            const file = new File(
              [blob],
              `clipboard-photo-${Date.now().toString().slice(-5)}.${ext}`,
              { type: imageType },
            );
            setPasteFeedback(`Loaded ${file.name} from clipboard.`);
            onFiles([file]);
            return;
          }
        }
        setPasteFeedback(
          "No image found in clipboard. Copy an image first or press Ctrl+V / Cmd+V anywhere on this page.",
        );
      } catch {
        setPasteFeedback(
          "Press Ctrl+V (or Cmd+V on Mac) anywhere on this page to paste your copied image directly.",
        );
      }
    } else {
      setPasteFeedback(
        "Press Ctrl+V (or Cmd+V on Mac) anywhere on this page to paste your copied image directly.",
      );
    }
  }

  return (
    <div
      className={cn("dropzone", className)}
      data-drag={dragOver || undefined}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onPaste={handleContainerPaste}
      aria-disabled={disabled || undefined}
      role="group"
      aria-label="Select or paste disaster photo"
      style={{
        minHeight: selectedFile ? 200 : 250,
        padding: "var(--s-5)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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

      {selectedFile ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 200px) 1fr",
            gap: "var(--s-4)",
            alignItems: "center",
            width: "100%",
            textAlign: "left",
          }}
        >
          <div
            style={{
              position: "relative",
              aspectRatio: "16 / 10",
              borderRadius: "var(--r-ctl)",
              overflow: "hidden",
              border: "1px solid var(--rule-strong)",
              background: "var(--sheet-sunk)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Selected preview: ${selectedFile.name}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <ImageIcon size={28} aria-hidden="true" style={{ color: "var(--tide)" }} />
            )}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                className="t-meta num"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--green-wash)",
                  color: "var(--green-ink)",
                  fontWeight: 700,
                }}
              >
                PHOTO READY
              </span>
              <span className="t-meta num">{formatFileSize(selectedFile.size)}</span>
              <span className="t-meta num">· {selectedFile.type || "image/jpeg"}</span>
            </div>
            <strong style={{ fontSize: "var(--step-1)", wordBreak: "break-word" }}>
              {selectedFile.name}
            </strong>
            <p className="t-meta" style={{ margin: 0 }}>
              Want to use a different image? Click below, drag a new file, or press{" "}
              <kbd
                style={{
                  padding: "1px 5px",
                  borderRadius: 4,
                  border: "1px solid var(--rule-strong)",
                  background: "var(--sheet-sunk)",
                  fontSize: "0.75rem",
                }}
              >
                Ctrl+V
              </kbd>{" "}
              to paste another photo.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                disabled={disabled}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Change photo
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={handleClipboardButtonClick}
                disabled={disabled}
              >
                <ClipboardPaste size={14} aria-hidden="true" />
                Paste from clipboard
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
            justifyItems: "center",
            width: "100%",
            maxWidth: 520,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--tide-wash)",
              color: "var(--tide)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Camera size={22} aria-hidden="true" />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ fontSize: "var(--step-1)" }}>
              Drop a field photo here, browse, or paste from clipboard
            </strong>
            <p className="t-meta" style={{ margin: 0 }}>
              {hint}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              width: "100%",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              disabled={disabled}
            >
              <Camera size={16} aria-hidden="true" />
              Take photo
            </button>
            <button
              type="button"
              className="btn"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={disabled}
            >
              <FolderUp size={16} aria-hidden="true" />
              Choose from library
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClipboardButtonClick}
              disabled={disabled}
              data-testid="paste-clipboard-btn"
            >
              <ClipboardPaste size={16} aria-hidden="true" />
              Paste image (Ctrl+V)
            </button>
          </div>
        </div>
      )}

      {pasteFeedback && (
        <p
          role="status"
          aria-live="polite"
          className="t-meta"
          style={{
            marginTop: 8,
            padding: "6px 12px",
            borderRadius: "var(--r-ctl)",
            background: "var(--tide-wash)",
            color: "var(--tide)",
            fontWeight: 600,
          }}
        >
          {pasteFeedback}
        </p>
      )}
    </div>
  );
}
