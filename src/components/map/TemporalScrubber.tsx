// src/components/map/TemporalScrubber.tsx
//
// Temporal Scrubber component docked at the bottom of the Incident Map.
// Filters visible incident pins based on their `uploaded_at` timestamp,
// allowing responders to replay and visualize incident progression over
// time with Play/Pause automation, step controls, and time presets.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IncidentMapReport } from "./IncidentMap";

export interface TemporalScrubberProps {
  reports: IncidentMapReport[];
  visibleCount: number;
  scrubberPct: number;
  onChangePct: (nextPct: number) => void;
  timeBounds: { min: number; max: number };
  cutoffTimestamp: number;
  className?: string;
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
  className,
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
      className={cn(
        "tactical-scrubber absolute z-20 inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-3",
        "bg-slate-950/95 dark:bg-[#0B141A]/95 backdrop-blur-xl",
        "border border-slate-800 rounded-2xl shadow-xl",
        "p-3 sm:px-4 sm:py-3 text-slate-100 flex flex-col gap-2",
        className,
      )}
      role="region"
      aria-label="Temporal incident progression scrubber"
      data-testid="temporal-scrubber"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Title + Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-bold text-white text-xs">
            <Clock className="size-3.5 text-teal-400" />
            <span className="hidden sm:inline">Temporal Incident Progression</span>
            <span className="sm:hidden">Timeline</span>
          </span>

          {/* Playback Controls */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePlayToggle}
              className="h-7 px-2.5 rounded-lg text-xs bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800 hover:text-white"
              title={isPlaying ? "Pause replay" : "Replay progression over time"}
            >
              {isPlaying ? <Pause className="size-3 mr-1 text-amber-400" /> : <Play className="size-3 mr-1 text-teal-400" />}
              <span>{isPlaying ? "Pause" : "Replay"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(Math.max(0, scrubberPct - 10));
              }}
              disabled={scrubberPct <= 0}
              className="size-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Step back 10%"
            >
              <SkipBack className="size-3.5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsPlaying(false);
                onChangePct(Math.min(100, scrubberPct + 10));
              }}
              disabled={scrubberPct >= 100}
              className="size-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Step forward 10%"
            >
              <SkipForward className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Current Cutoff Readout Badge */}
        <div className="flex items-center gap-2">
          <Badge className="bg-teal-600 hover:bg-teal-500 text-white font-mono text-[11px] px-2.5 py-0.5 border-0 shadow-sm">
            {scrubberPct >= 100
              ? `LIVE · All ${visibleCount} pins`
              : `${formatScrubberTime(cutoffTimestamp)} (${visibleCount} pins)`}
          </Badge>
        </div>
      </div>

      {/* Track + Histogram Slider */}
      <div className="flex flex-col gap-1">
        {/* Histogram Bars */}
        <div className="grid grid-cols-12 gap-1 h-3 px-1 items-end">
          {histogramBuckets.map((bucket) => {
            const isActive = scrubberPct >= bucket.thresholdPct;
            return (
              <div
                key={bucket.index}
                className={cn(
                  "rounded-xs transition-colors duration-200",
                  isActive ? "bg-teal-500/80" : "bg-slate-800/80",
                )}
                style={{ height: `${bucket.heightPct}%` }}
                title={`${bucket.count} incidents uploaded`}
              />
            );
          })}
        </div>

        {/* Slider Input */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={scrubberPct}
          onChange={(e) => {
            setIsPlaying(false);
            onChangePct(Number(e.target.value));
          }}
          aria-label="Filter incidents by upload time"
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
        />

        {/* Bottom Time Range + Jump Buttons */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
          <span className="truncate max-w-[130px] sm:max-w-none">
            {formatScrubberTime(timeBounds.min)}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500 mr-1 hidden sm:inline">Jump:</span>
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onChangePct(pct);
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all",
                  scrubberPct === pct
                    ? "bg-teal-600 text-white font-bold"
                    : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800",
                )}
              >
                {pct === 100 ? "Live" : `${pct}%`}
              </button>
            ))}
          </div>

          <span className="truncate max-w-[130px] sm:max-w-none text-right">
            {formatScrubberTime(timeBounds.max)}
          </span>
        </div>
      </div>
    </div>
  );
}
