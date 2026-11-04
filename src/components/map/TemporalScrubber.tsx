"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Play, Pause, RotateCcw } from "lucide-react";
import { workspaceAction } from "@/lib/workspace/presentation";

export interface TemporalScrubberProps {
  reports: Array<{ uploaded_at?: string }>; visibleCount: number; scrubberPct: number;
  onChangePct: (nextPct: number) => void; timeBounds: { min: number; max: number };
  cutoffTimestamp: number; className?: string;
}
function formatTime(timestamp: number) { return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable"; }

/** Uploaded-time filter, deliberately outside the map canvas and its overlays. */
export function TemporalScrubber({ reports, visibleCount, scrubberPct, onChangePct, timeBounds, cutoffTimestamp, className = "" }: TemporalScrubberProps) {
  const [playing, setPlaying] = useState(false);
  const canReplay = Number.isFinite(timeBounds.min) && Number.isFinite(timeBounds.max) && timeBounds.max > timeBounds.min;
  useEffect(() => {
    if (!playing || !canReplay) return;
    const timer = setTimeout(() => { const next = Math.min(100, scrubberPct + 5); onChangePct(next); if (next >= 100) setPlaying(false); }, 650);
    return () => clearTimeout(timer);
  }, [playing, canReplay, scrubberPct, onChangePct]);
  const buckets = useMemo(() => {
    const counts = Array<number>(12).fill(0);
    reports.forEach((report) => { const timestamp = Date.parse(report.uploaded_at ?? ""); if (!Number.isFinite(timestamp)) return; const index = Math.max(0, Math.min(11, Math.floor((timestamp - timeBounds.min) / Math.max(1, timeBounds.max - timeBounds.min) * 12))); counts[index] += 1; });
    return counts;
  }, [reports, timeBounds]);
  const peak = Math.max(1, ...buckets); const currentLabel = scrubberPct >= 100 ? "All loaded reports" : `Reported by ${formatTime(cutoffTimestamp)}`;
  return <section className={`grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-4 ${className}`} aria-label="Reported-time timeline" data-testid="temporal-scrubber">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg"><Clock size={18} aria-hidden="true" />Reported-time timeline</h2><span className="text-sm text-[var(--ink-2)]">{visibleCount} matching</span></div>
    <p className="text-xs text-[var(--ink-3)]">Filter by upload time. This shows when reports arrived, not when an incident began.</p>
    <div className="grid h-8 grid-cols-12 items-end gap-1" aria-hidden="true">{buckets.map((count, index) => <div key={index} className="rounded-t bg-[var(--tide)] opacity-60" style={{ height: `${count / peak * 100}%` }} />)}</div>
    <label className="grid min-w-0 gap-1 text-sm font-semibold"><span>{currentLabel}</span><input type="range" min={0} max={100} step={1} value={scrubberPct} disabled={!canReplay} onChange={(event) => { setPlaying(false); onChangePct(Number(event.target.value)); }} aria-label="Filter reports by upload time" aria-valuetext={currentLabel} className="h-11 w-full min-w-0 cursor-pointer accent-[var(--tide)] disabled:cursor-not-allowed" /></label>
    <div className="flex min-w-0 flex-wrap justify-between gap-2 font-mono text-xs text-[var(--ink-3)]"><span>{formatTime(timeBounds.min)}</span><span>{formatTime(timeBounds.max)}</span></div>
    <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={!canReplay} aria-pressed={playing} className={`${workspaceAction} w-full sm:w-auto`} onClick={() => { if (!playing && scrubberPct >= 100) onChangePct(0); setPlaying((value) => !value); }}>{playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? "Pause replay" : "Replay reports"}</button><button type="button" className={`${workspaceAction} w-full sm:w-auto`} onClick={() => { setPlaying(false); onChangePct(100); }}><RotateCcw size={16} aria-hidden="true" />All loaded reports</button></div>
  </section>;
}
