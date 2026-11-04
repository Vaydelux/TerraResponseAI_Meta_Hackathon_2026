"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SAMPLE_IMAGE } from "./sample-data";

function SampleImageMedia({ src, alt, eager, conceptHighlight }: { src: string; alt: string; eager: boolean; conceptHighlight: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  const resolveImage = useCallback(async (image: HTMLImageElement) => {
    try {
      if (typeof image.decode === "function") await image.decode();
      if (image.naturalWidth === 0) throw new Error("Sample image did not decode");
      if (imageRef.current === image) setStatus("loaded");
    } catch {
      if (imageRef.current === image) setStatus("failed");
    }
  }, []);
  const captureImage = useCallback((image: HTMLImageElement | null) => {
    imageRef.current = image;
    if (image?.complete) void resolveImage(image);
  }, [resolveImage]);

  useEffect(() => {
    // Offscreen lazy images have not started a request yet.
    if (status !== "loading" || !eager) return;
    const timeout = window.setTimeout(() => setStatus("failed"), 12_000);
    return () => window.clearTimeout(timeout);
  }, [status, attempt, eager]);

  return (
    <div className="relative grid aspect-[16/10] min-w-0 overflow-hidden bg-[var(--sheet-sunk)]" aria-busy={status === "loading"}>
      {status === "failed" ? (
        <div className="grid min-w-0 content-center justify-items-center gap-2 p-2 text-center text-xs text-[var(--ink-2)] sm:p-4 sm:text-sm">
          <ImageOff size={24} className="hidden sm:block" aria-hidden="true" />
          <p role="status">Sample image unavailable. You can continue exploring the workflow.</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt((previous) => previous + 1); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-[var(--rule-strong)] bg-[var(--sheet)] px-4 py-3 font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tide)] active:bg-[var(--sheet-sunk)] motion-reduce:transition-none"><RotateCcw size={16} className="shrink-0" aria-hidden="true" />Retry sample image</button>
        </div>
      ) : (
        <>
          {status === "loading" && <p className="col-start-1 row-start-1 grid content-center p-4 text-center text-sm text-[var(--ink-2)]" role="status">Loading sample image…</p>}
          <img
            key={attempt}
            ref={captureImage}
            src={src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            className={cn("col-start-1 row-start-1 h-full w-full min-w-0 object-cover", status === "loading" && "opacity-0")}
            onError={() => setStatus("failed")}
            onLoad={(event) => { void resolveImage(event.currentTarget); }}
          />
          {conceptHighlight && status === "loaded" && <div className="pointer-events-none absolute inset-[15%_10%_20%_8%] rounded border-2 border-[var(--flood)] bg-[var(--flood)]/25" aria-hidden="true" />}
        </>
      )}
    </div>
  );
}

export function SampleImage({
  caption = SAMPLE_IMAGE.provenance,
  conceptHighlight = false,
  eager = false,
  className,
  src = SAMPLE_IMAGE.src,
  alt = SAMPLE_IMAGE.alt,
}: {
  caption?: string;
  conceptHighlight?: boolean;
  eager?: boolean;
  className?: string;
  src?: string;
  alt?: string;
}) {
  return (
    <figure className={cn("grid min-w-0 overflow-hidden rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet)]", className)}>
      <p className="bg-[var(--amber-wash)] px-4 py-3 text-sm font-semibold text-[var(--amber-ink)]">AI generated, not verified</p>
      <SampleImageMedia key={src} src={src} alt={alt} eager={eager} conceptHighlight={conceptHighlight} />
      <figcaption className="break-words border-t border-[var(--rule)] px-4 py-3 text-xs leading-relaxed text-[var(--ink-2)]">{caption}</figcaption>
    </figure>
  );
}
