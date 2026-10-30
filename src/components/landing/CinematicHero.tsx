// src/components/landing/CinematicHero.tsx
//
// The cinematic hero background video. Uses the supplied montage
// (1920×1080 H.264, 13.3s, 2.2MB) with a poster fallback.
//
// Performance + accessibility:
//   - Poster loads first (no layout shift); video loads async
//   - preload="auto" only when visible + not reduced-motion
//   - IntersectionObserver pauses when offscreen
//   - prefers-reduced-motion: poster only, no video
//   - Pause/play control for keyboard + screen-reader access
//   - Muted + playsInline + loop (browser autoplay policy compliant)
//   - Falls back to poster on video error
//   - Dark gradient overlay ensures text readability

"use client";

import { useEffect, useRef, useState } from "react";

export interface CinematicHeroProps {
  /** Poster image (loaded immediately, before video). */
  poster: string;
  /** Video sources (tried in order). */
  sources: { src: string; type: string }[];
  /** CSS class for the container. */
  className?: string;
  /** Inline style for the container. */
  style?: React.CSSProperties;
}

export function CinematicHero({
  poster,
  sources,
  className,
  style,
}: CinematicHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Check reduced-motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    // Use a microtask to avoid the synchronous setState lint
    queueMicrotask(() => setPrefersReducedMotion(mq.matches));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // IntersectionObserver — pause when offscreen, play when visible
  useEffect(() => {
    if (!containerRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
          const video = videoRef.current;
          if (!video) continue;
          if (entry.isIntersecting && !prefersReducedMotion && !videoFailed) {
            video.play().catch(() => {
              // Autoplay blocked — fall back to poster
              setVideoFailed(true);
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.1 },
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, [prefersReducedMotion, videoFailed]);

  // Pause/play toggle
  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => setVideoFailed(true));
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  // If reduced-motion or video failed, show poster only
  if (prefersReducedMotion || videoFailed) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", overflow: "hidden", ...style }}
      >
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(15,26,34,0.92) 0%, rgba(15,26,34,0.82) 40%, rgba(15,26,34,0.55) 75%, rgba(15,26,34,0.35) 100%)",
          }}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
        autoPlay
        muted
        loop
        playsInline
        preload={isVisible ? "auto" : "none"}
        poster={poster}
        onError={() => setVideoFailed(true)}
        aria-hidden="true"
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>

      {/* Dark gradient overlay — text readability.
          Stronger darkness on the left for the headline. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(15,26,34,0.92) 0%, rgba(15,26,34,0.82) 40%, rgba(15,26,34,0.55) 75%, rgba(15,26,34,0.35) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Pause/play control — accessible */}
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause background video" : "Play background video"}
        style={{
          position: "absolute",
          bottom: "var(--s-3)",
          right: "var(--s-3)",
          zIndex: 10,
          display: "inline-grid",
          placeItems: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--r-pill)",
          background: "rgba(15,26,34,0.6)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#E8EEF0",
          cursor: "pointer",
          backdropFilter: "none",
        }}
      >
        {isPlaying ? (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x={6} y={4} width={4} height={16} rx={1} />
            <rect x={14} y={4} width={4} height={16} rx={1} />
          </svg>
        ) : (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
