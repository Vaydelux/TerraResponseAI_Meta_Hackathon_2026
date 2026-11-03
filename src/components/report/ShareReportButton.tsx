"use client";

import React, { useState, useCallback } from "react";
import { Share2, Check } from "lucide-react";
import { toast } from "@/components/ui-tr";

export interface ShareReportButtonProps {
  reportId: string;
  title?: string | null;
  variant?: "default" | "quiet";
  size?: "sm" | "md";
  className?: string;
}

export function ShareReportButton({
  reportId,
  title,
  variant = "quiet",
  size = "sm",
  className = "",
}: ShareReportButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (typeof window === "undefined") return;
      const deepLink = `${window.location.origin}/reports/${encodeURIComponent(reportId)}`;

      let success = false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(deepLink);
          success = true;
        }
      } catch {
        success = false;
      }

      if (!success) {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = deepLink;
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.top = "-9999px";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          success = document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch {
          success = false;
        }
      }

      if (success) {
        setCopied(true);
        toast.success(
          title
            ? `Copied link to "${title.slice(0, 42)}${title.length > 42 ? "…" : ""}"`
            : "Incident report link copied to clipboard."
        );
        window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      } else {
        toast.error(
          "Unable to copy automatically. Copy the URL from your address bar."
        );
      }
    },
    [reportId, title]
  );

  const btnClasses = [
    "btn",
    variant === "quiet" ? "btn--quiet" : "",
    size === "sm" ? "btn--sm" : "",
    "share-report-btn",
    copied ? "share-report-btn--copied" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={handleShare}
      className={btnClasses}
      data-testid="share-report-btn"
      data-report-id={reportId}
      aria-label={
        copied
          ? "Incident link copied to clipboard"
          : `Share link to incident report${title ? `: ${title}` : ""}`
      }
      title={copied ? "Link copied!" : "Copy deep link to incident report"}
    >
      {copied ? (
        <>
          <Check size={13} aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Share2 size={13} aria-hidden="true" />
          <span>Share</span>
        </>
      )}
    </button>
  );
}
