"use client";

import { useEffect, useRef, useState } from "react";

export interface CinematicHeroProps {
  poster: string;
  sources: { src: string; type: string }[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Decorative hero media, never evidence. A poster is always rendered, while
 * video is mounted only after the visitor's motion/data preferences are known.
 * A manual pause is sticky across scroll and tab visibility changes.
 */
export function CinematicHero({ poster, sources, className, style }: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaAllowed, setMediaAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedData = window.matchMedia("(prefers-reduced-data: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setMediaAllowed(
      !reducedMotion.matches && !reducedData.matches && !connection?.saveData
    );
    update();
    reducedMotion.addEventListener("change", update);
    reducedData.addEventListener("change", update);
    return () => {
      reducedMotion.removeEventListener("change", update);
      reducedData.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!mediaAllowed || !visible || userPaused || document.hidden || failed) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      // Autoplay can be blocked by browser policy; the poster remains useful.
      setUserPaused(true);
    });
  }, [mediaAllowed, visible, userPaused, failed]);

  useEffect(() => {
    const handleVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (mediaAllowed && visible && !userPaused && !failed) {
        void video.play().catch(() => setUserPaused(true));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [mediaAllowed, visible, userPaused, failed]);

  const shouldMountVideo = mediaAllowed && visible && !failed;
  const overlay = "linear-gradient(90deg, rgba(15,26,34,0.92) 0%, rgba(15,26,34,0.82) 40%, rgba(15,26,34,0.55) 75%, rgba(15,26,34,0.35) 100%)";

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", overflow: "hidden", ...style }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, backgroundImage: `url("${poster}")`,
        backgroundPosition: "center", backgroundSize: "cover"
      }} />
      {shouldMountVideo && (
        <video
          ref={videoRef}
          aria-hidden="true"
          muted loop playsInline preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        >
          {sources.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
        </video>
      )}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: overlay }} />
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
              void video.play().catch(() => setUserPaused(true));
            }
          }}
          style={{
            position: "absolute", right: "var(--s-3)", bottom: "var(--s-3)",
            zIndex: 10, minWidth: 44, minHeight: 44, display: "grid",
            placeItems: "center", borderRadius: "var(--r-pill)", cursor: "pointer",
            background: "rgba(15,26,34,0.85)", color: "#E8EEF0",
            border: "1px solid rgba(255,255,255,0.35)"
          }}
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
  );
}
