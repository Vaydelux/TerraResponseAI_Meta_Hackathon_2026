"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CinematicHeroProps {
  poster: string;
  sources: { src: string; type: string }[];
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

/**
 * Decorative hero media, never evidence. A poster is always rendered, while
 * video is mounted only after the visitor's motion/data preferences are known.
 * A manual pause is sticky across scroll and tab visibility changes.
 */
export function CinematicHero({ poster, sources, className, style, children }: CinematicHeroProps) {
  return <CinematicHeroMedia key={JSON.stringify([poster, sources])} poster={poster} sources={sources} className={className} style={style}>{children}</CinematicHeroMedia>;
}

function subscribePreference(query: MediaQueryList, listener: () => void): () => void {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }
  if (typeof query.addListener === "function") {
    query.addListener(listener);
    return () => query.removeListener(listener);
  }
  return () => {};
}

function CinematicHeroMedia({ poster, sources, className, style, children }: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaAllowed, setMediaAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Without preference detection, keep the static poster rather than autoplay.
    if (typeof window.matchMedia !== "function") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedData = window.matchMedia("(prefers-reduced-data: reduce)");
    const connection = (navigator as Navigator & { connection?: Partial<EventTarget> & { saveData?: boolean } }).connection;
    const update = () => setMediaAllowed(
      !reducedMotion.matches && !reducedData.matches && !connection?.saveData
    );
    update();
    const unsubscribeMotion = subscribePreference(reducedMotion, update);
    const unsubscribeData = subscribePreference(reducedData, update);
    connection?.addEventListener?.("change", update);
    return () => {
      unsubscribeMotion();
      unsubscribeData();
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    let active = true;
    if (!element || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => { if (active) setVisible(true); });
      return () => { active = false; };
    }
    let observer: IntersectionObserver | undefined;
    try {
      observer = new IntersectionObserver(
        ([entry]) => { if (active) setVisible(Boolean(entry?.isIntersecting)); },
        { threshold: 0.1 }
      );
      observer.observe(element);
      return () => { active = false; observer?.disconnect(); };
    } catch {
      observer?.disconnect();
      queueMicrotask(() => { if (active) setVisible(true); });
      return () => { active = false; };
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    if (!mediaAllowed || !visible || userPaused || document.hidden || failed) {
      video.pause();
      return () => { active = false; };
    }
    void video.play().catch(() => {
      // Autoplay can be blocked by browser policy; the poster remains useful.
      if (active && videoRef.current === video) setUserPaused(true);
    });
    return () => { active = false; video.pause(); };
  }, [mediaAllowed, visible, userPaused, failed]);

  useEffect(() => {
    let active = true;
    const handleVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (mediaAllowed && visible && !userPaused && !failed) {
        void video.play().catch(() => { if (active && videoRef.current === video) setUserPaused(true); });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { active = false; document.removeEventListener("visibilitychange", handleVisibility); };
  }, [mediaAllowed, visible, userPaused, failed]);

  const shouldMountVideo = mediaAllowed && visible && !failed && sources.length > 0;
  return (
    <div ref={containerRef} className={cn("relative isolate grid min-w-0 overflow-hidden bg-[var(--brand-tile)]", className)} style={style}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${poster}")` }} />
      {shouldMountVideo && (
        <video
          ref={videoRef}
          aria-hidden="true"
          muted loop playsInline preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        >
          {sources.map((source) => <source key={source.src} src={source.src} type={source.type} onError={() => { if (sources.length === 1) setFailed(true); }} />)}
        </video>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[var(--brand-tile)]/85" />
      {children}
      <div className="relative z-10 mx-auto flex min-h-16 w-full max-w-[var(--content-max)] justify-end px-4 pb-4 sm:px-6 lg:px-10">
        {shouldMountVideo && (
        <button
          type="button"
          aria-label={userPaused || !playing ? "Play background video" : "Pause background video"}
          aria-pressed={playing}
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (!video.paused) {
              setUserPaused(true);
              video.pause();
            } else {
              setUserPaused(false);
              void video.play().catch(() => { if (videoRef.current === video) setUserPaused(true); });
            }
          }}
          className="grid size-12 place-items-center rounded-full border border-[var(--on-brand-tile)] bg-[var(--brand-tile)] text-[var(--on-brand-tile)] transition-colors hover:bg-[var(--tide-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--on-brand-tile)] active:bg-[var(--tide-press)] motion-reduce:transition-none"
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        )}
      </div>
    </div>
  );
}
