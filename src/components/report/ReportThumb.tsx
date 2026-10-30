// src/components/report/ReportThumb.tsx
//
// A small thumbnail component for report rows + map panels. The
// report's thumbnail is fetched via a signed URL — but signing a URL
// on the server for each row is expensive (the rate limit is 60/min
// per user). Instead, we render a placeholder block that uses the
// report's status-derived color (the sheet-sunk background by
// default). The actual thumbnail is loaded client-side via
// /api/reports/[id]/evidence?kind=thumbnail if available — this
// component handles that fetch.
//
// Client component — needs the fetch + image error handling. The
// fallback (when the signed URL fetch fails or the report is purged)
// is a neutral block with the Seal glyph as the placeholder.

"use client";

import { useEffect, useState } from "react";
import { type VerificationState, SEAL_CLASS } from "@/lib/design/status";

export interface ReportThumbProps {
  reportId: string;
  /** When true (default), fetches a thumbnail signed URL on mount. */
  loadSignedUrl?: boolean;
  /** The verification state — used for the placeholder glyph color. */
  state: VerificationState;
  alt: string;
  /** Optional className — overrides the default .report-row__thumb. */
  className?: string;
}

/**
 * Inline state-icon glyph for the placeholder (mirrors the SealBadge
 * icon set). Kept local to ReportThumb so we don't need a separate
 * SealIcons file.
 */
function ThumbGlyph({ state }: { state: VerificationState }) {
  const paths: Record<VerificationState, string> = {
    pending:   "M9 9a3 3 0 1 1 4 3c-.7.4-1 .8-1 2M12 17h.01",
    confirmed: "M5 12l5 5L20 7",
    corrected: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    flagged:   "M5 21V4M5 4h11l-2 4 2 4H5",
    rejected:  "M6 6l12 12M18 6L6 18",
    failed:    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5 5l14 14",
  };
  const dashed = state === "pending" || state === "failed";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={dashed ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "3 2" : undefined}
      aria-hidden="true"
    >
      <path d={paths[state]} />
    </svg>
  );
}

export function ReportThumb({
  reportId,
  loadSignedUrl = true,
  state,
  alt,
  className = "report-row__thumb",
}: ReportThumbProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loadSignedUrl) return;
    let aborted = false;
    fetch(`/api/reports/${reportId}/evidence?kind=thumbnail`)
      .then((r) => r.json())
      .then((body) => {
        if (aborted) return;
        if (body?.ok && body.signedUrl) setSrc(body.signedUrl);
        else setFailed(true);
      })
      .catch(() => {
        if (!aborted) setFailed(true);
      });
    return () => {
      aborted = true;
    };
  }, [reportId, loadSignedUrl]);

  if (src && !failed) {
    return <img className={className} src={src} alt={alt} loading="lazy" />;
  }

  // Placeholder: the Seal glyph in the state color, centered on the
  // sheet-sunk background. The color comes from the SEAL_CLASS so it
  // matches the SealBadge in the same row.
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "grid",
        placeItems: "center",
        color: state === "pending" ? "var(--amber-ink)" :
               state === "confirmed" ? "var(--green)" :
               state === "corrected" ? "var(--tide)" :
               state === "flagged" ? "var(--amber-ink)" :
               state === "rejected" ? "var(--brick-ink)" :
               "var(--graphite)",
      }}
    >
      <ThumbGlyph state={state} />
    </span>
  );
}
