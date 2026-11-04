"use client";

import { useEffect, useState } from "react";
import { ImageOff, LoaderCircle, RotateCcw } from "lucide-react";
import type { VerificationState } from "@/lib/design/status";
import { cn } from "@/lib/utils";
import { workspaceAction } from "@/lib/workspace/presentation";

export interface ReportThumbProps {
  reportId: string;
  loadSignedUrl?: boolean;
  state: VerificationState;
  alt: string;
  className?: string;
  /** Use only in full evidence views, never inside a clickable report row. */
  showRetry?: boolean;
}

function SignedReportThumb({ reportId, loadSignedUrl = true, alt, className = "report-row__thumb", showRetry = false }: ReportThumbProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(!loadSignedUrl);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!loadSignedUrl) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => { if (!disposed) { setFailed(true); controller.abort(); } }, 12000);
    async function load() {
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/evidence?kind=thumbnail`, { signal: controller.signal });
        if (!response.ok) throw new Error("Evidence unavailable");
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null || !("ok" in body) || !body.ok || !("signedUrl" in body) || typeof body.signedUrl !== "string") throw new Error("Evidence unavailable");
        const url = new URL(body.signedUrl, window.location.origin);
        if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === window.location.origin)) throw new Error("Evidence unavailable");
        if (!disposed && !controller.signal.aborted) setSrc(url.href);
      } catch {
        if (!disposed) setFailed(true);
      } finally { clearTimeout(timeout); }
    }
    void load();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [reportId, loadSignedUrl, attempt]);

  if (src && !failed) return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  const Icon = failed ? ImageOff : LoaderCircle;
  return <span className={cn(className, "grid content-center justify-items-center gap-3 bg-[var(--sheet-sunk)] p-3 text-[var(--ink-3)]")} role={showRetry ? "group" : "img"} aria-label={`${alt}. ${failed ? "Evidence image unavailable" : "Loading evidence image"}`}>
    <Icon className={cn("size-6", !failed && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
    {showRetry && <><span className="text-center text-xs">{failed ? "Evidence image unavailable" : "Loading private evidence…"}</span>{failed && loadSignedUrl && <button type="button" className={`${workspaceAction} text-xs`} onClick={(event) => { event.stopPropagation(); setSrc(null); setFailed(false); setAttempt((value) => value + 1); }}><RotateCcw size={14} aria-hidden="true" />Retry image</button>}</>}
  </span>;
}

/** Keying by identity prevents a previous report's image or error state leaking into a new selection. */
export function ReportThumb(props: ReportThumbProps) {
  return <SignedReportThumb key={`${props.reportId}:${props.loadSignedUrl !== false}`} {...props} />;
}
