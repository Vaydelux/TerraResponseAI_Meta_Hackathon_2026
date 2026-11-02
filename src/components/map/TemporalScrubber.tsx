"use client";

// src/components/map/TemporalScrubber.tsx
//
// Temporal Scrubber component docked at the bottom of the Incident Map.
// Filters visible incident pins based on their `uploaded_at` timestamp,
// allowing responders to replay and visualize incident progression over
// time with Play/Pause automation, step controls, and time presets.

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import type { IncidentMapReport } from "./IncidentMap";

export interface TemporalScrubberProps {
  reports: IncidentMapReport[];
  visibleCount: number;
  scrubberPct: number;
  onChangePct: (nextPct: number) => void;
  timeBounds: { min: number; max: number };
  cutoffTimestamp: number;
}

function formatScrubberTime(ms: number): string {
  if (!Number.isFinite(ms)) return "Live";
  const d = new Date(ms);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TemporalScrubber({
  reports,
  visibleCount,
  scrubberPct,
  onChangePct,
  timeBounds,
  cutoffTimestamp,
}: TemporalScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Advance the timeline scrubber automatically when Play is active
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      onChangePct(scrubberPct >= 100 ? 10 : Math.min(100, scrubberPct + 5));
    }, 650);
    return () => clearInterval(timer);
  }, [isPlaying, scrubberPct, onChangePct]);

  // Stop playback automatically once it reaches 100%
  useEffect(() => {
    if (isPlaying && scrubberPct >= 100) {
      const stopTimer = setTimeout(() => setIsPlaying(false), 400);
      return () => clearTimeout(stopTimer);
    }
  }, [isPlaying, scrubberPct]);

  // Build 12 histogram buckets across [min, max] based on report `uploaded_at`
  const histogramBuckets = useMemo(() => {
    const bucketCount = 12;
    const counts = new Array<number>(bucketCount).fill(0);
    const span = Math.max(1, timeBounds.max - timeBounds.min);

    for (const r of reports) {
      if (!r.uploaded_at) continue;
      const ts = new Date(r.uploaded_at).getTime();
      if (!Number.isFinite(ts)) continue;
      const ratio = Math.max(0, Math.min(0.999, (ts - timeBounds.min) / span));
      const idx = Math.floor(ratio * bucketCount);
      counts[idx] += 1;
    }

    const maxBucket = Math.max(1, ...counts);
    return counts.map((count, i) => ({
      index: i,
      count,
      heightPct: Math.max(18, Math.round((count / maxBucket) * 100)),
      thresholdPct: Math.round(((i + 1) / bucketCount) * 100),
    }));
  }, [reports, timeBounds]);

  function handlePlayToggle() {
    if (!isPlaying && scrubberPct >= 100) {
      onChangePct(10);
    }
    setIsPlaying((prev) => !prev);
  }

  return (
    <div
      className="tactical-scrubber"
      role="region"
      aria-label="Temporal incident progression scrubber"
      data-testid="temporal-scrubber"
    >
      <div className="tactical-scrubber__head">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            <Clock size={15} aria-hidden="true" style={{ color: "var(--tide)" }} />
            Temporal Incident Progression
          </span>

          {/* Playback Controls */}
          <div className="tactical-scrubber__controls" role="group" aria-label="Timeline playback controls">
            <button
              type="button"
              className="tactical-scrubber__ctl-btn"
              onClick={handlePlayToggle}
              aria-label={isPlaying ? "Pause timeline progression" : "Play timeline progression"}
              title={isPlaying ? "Pause replay" : "Replay incident progression over time"}
            >
              {isPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
              <span>{isPlaying ? "Pause" : "Replay"}</span>
            </button>

            <button
              type="button"
              className="tactical-scrubber__ctl-btn"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(Math.max(0, scrubberPct - 10));
              }}
              disabled={scrubberPct <= 0}
              aria-label="Step backward in time"
              title="Step backward (-10%)"
            >
              <SkipBack size={13} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="tactical-scrubber__ctl-btn"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(Math.min(100, scrubberPct + 10));
              }}
              disabled={scrubberPct >= 100}
              aria-label="Step forward in time"
              title="Step forward (+10%)"
            >
              <SkipForward size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Cutoff Timestamp & Visible Pin Count Readout */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <span
            className="num tactical-scrubber__cutoff-pill"
            data-testid="temporal-scrubber-readout"
          >
            {scrubberPct >= 100
              ? `LIVE · All ${visibleCount} pins (${formatScrubberTime(timeBounds.max)})`
              : `Uploaded ≤ ${formatScrubberTime(cutoffTimestamp)} · ${visibleCount} of ${reports.length} pins`}
          </span>

          {scrubberPct < 100 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(100);
              }}
              style={{ minHeight: 28, padding: "0 10px", fontSize: "0.75rem" }}
            >
              <RotateCcw size={12} aria-hidden="true" />
              Reset to Live
            </button>
          )}
        </div>
      </div>

      {/* Upload Activity Histogram + Range Scrubber */}
      <div className="tactical-scrubber__track-wrap">
        <div className="tactical-scrubber__histogram" aria-hidden="true">
          {histogramBuckets.map((b) => {
            const active = b.thresholdPct <= scrubberPct;
            return (
              <div
                key={b.index}
                className="tactical-scrubber__bar"
                data-active={active ? "true" : "false"}
                style={{ height: `${b.heightPct}%` }}
                title={`${b.count} report(s) uploaded in interval`}
              />
            );
          })}
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={scrubberPct}
          onChange={(e) => {
            setIsPlaying(false);
            onChangePct(Number(e.target.value));
          }}
          aria-label="Filter visible incident pins by uploaded_at timestamp"
          className="tactical-scrubber__range"
        />
      </div>

      {/* Bottom Time Bounds & Quick Jump Presets */}
      <div
        className="t-meta num"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s-2)",
          fontSize: "0.75rem",
        }}
      >
        <span>Earliest upload: {formatScrubberTime(timeBounds.min)}</span>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>Jump:</span>
          {[
            { label: "25%", pct: 25 },
            { label: "50%", pct: 50 },
            { label: "75%", pct: 75 },
            { label: "Live (100%)", pct: 100 },
          ].map((preset) => (
            <button
              key={preset.pct}
              type="button"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(preset.pct);
              }}
              className="tactical-scrubber__jump-btn"
              aria-pressed={scrubberPct === preset.pct}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <span>Latest upload: {formatScrubberTime(timeBounds.max)}</span>
      </div>
    </div>
  );
}
