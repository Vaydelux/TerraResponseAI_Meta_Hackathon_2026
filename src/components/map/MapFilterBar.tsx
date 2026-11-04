"use client";

import { Waves, Flame, HeartPulse, Building2, AlertOctagon, Construction, Layers, Search, Map as MapIcon, LayoutGrid, HelpCircle } from "lucide-react";
import { classifyHazard } from "@/lib/workspace/incidents";
import { workspaceAction } from "@/lib/workspace/presentation";
import type { IncidentMapReport } from "./IncidentMap";

export type HazardCategoryId = "flooding" | "fire" | "medical" | "visible_structural_damage" | "blocked_road" | "debris" | "other";
export type PendingFilterMode = "confirmed" | "all";
export interface HazardCategoryDef { id: HazardCategoryId; label: string; shortLabel: string; icon: typeof Layers; dotColor: string }
export const MAP_HAZARD_CATEGORIES: HazardCategoryDef[] = [
  { id: "flooding", label: "Flood", shortLabel: "Flood", icon: Waves, dotColor: "var(--flood)" },
  { id: "fire", label: "Fire & Hazmat", shortLabel: "Fire & Hazmat", icon: Flame, dotColor: "var(--brick)" },
  { id: "medical", label: "Medical & Rescue", shortLabel: "Medical", icon: HeartPulse, dotColor: "var(--brick)" },
  { id: "visible_structural_damage", label: "Structural damage", shortLabel: "Structural", icon: Building2, dotColor: "var(--tide)" },
  { id: "blocked_road", label: "Blocked road", shortLabel: "Road", icon: AlertOctagon, dotColor: "var(--tide)" },
  { id: "debris", label: "Debris", shortLabel: "Debris", icon: Construction, dotColor: "var(--graphite)" },
  { id: "other", label: "Other / Unclassified", shortLabel: "Other", icon: HelpCircle, dotColor: "var(--graphite)" },
];
export function resolveHazardCategory(report: IncidentMapReport): HazardCategoryId {
  const category = classifyHazard({ ...report, uploaded_at: report.uploaded_at ?? "", incident_type: report.incidentType });
  const aliases = { flood: "flooding", hazmat: "fire", medical: "medical", structural: "visible_structural_damage", road: "blocked_road", debris: "debris", other: "other" } as const;
  return aliases[category];
}
export const SEVERITY_LEVELS = [
  { level: 5, label: "Severity 5", short: "Sev 5", tone: "var(--sev-5)" },
  { level: 4, label: "Severity 4", short: "Sev 4", tone: "var(--sev-4)" },
  { level: 3, label: "Severity 3", short: "Sev 3", tone: "var(--sev-3)" },
  { level: 2, label: "Severity 2", short: "Sev 2", tone: "var(--sev-2)" },
  { level: 1, label: "Severity 1", short: "Sev 1", tone: "var(--sev-1)" },
] as const;
export interface MapFilterBarProps {
  reports: IncidentMapReport[]; visibleCount: number; confirmedCount: number;
  selectedHazards: HazardCategoryId[]; onToggleHazard: (category: HazardCategoryId) => void; onResetHazards: () => void;
  selectedSeverities: number[]; onToggleSeverity: (severity: number) => void; onSelectSeverityPreset: (levels: number[]) => void;
  pendingMode: PendingFilterMode; onChangePendingMode: (mode: PendingFilterMode) => void;
  showHeatmap: boolean; onToggleHeatmap: () => void; searchQuery?: string; onChangeSearchQuery?: (query: string) => void;
  hasActiveFilters: boolean; onResetAllFilters: () => void; viewMode?: "map" | "split"; onChangeViewMode?: (mode: "map" | "split") => void; className?: string;
}
const pressedClass = "border-[var(--tide)] bg-[var(--tide-wash)] text-tide";
export function MapFilterBar({ reports, visibleCount, confirmedCount, selectedHazards, onToggleHazard, onResetHazards, selectedSeverities, onToggleSeverity, onSelectSeverityPreset, pendingMode, onChangePendingMode, showHeatmap, onToggleHeatmap, searchQuery = "", onChangeSearchQuery, hasActiveFilters, onResetAllFilters, viewMode = "split", onChangeViewMode, className = "" }: MapFilterBarProps) {
  return <section className={`grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-3 sm:p-4 ${className}`} aria-label="Map filters">
    {onChangeSearchQuery && <label className="flex min-w-0 items-center gap-2 rounded-ctl border border-[var(--rule-strong)] px-3 focus-within:ring-2 focus-within:ring-tide"><Search className="size-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" /><span className="sr-only">Search mapped reports</span><input type="search" value={searchQuery} maxLength={240} onChange={(event) => onChangeSearchQuery(event.target.value)} placeholder="Search mapped reports" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink focus-visible:shadow-none focus-visible:outline-none" /></label>}
    <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2" role="group" aria-label="Filter incidents by hazard category">
      <button type="button" aria-pressed={!selectedHazards.length} onClick={onResetHazards} className={`${workspaceAction} shrink-0 rounded-full ${!selectedHazards.length ? pressedClass : ""}`}><Layers size={16} aria-hidden="true" />All hazards ({reports.length})</button>
      {MAP_HAZARD_CATEGORIES.map(({ id, shortLabel, icon: Icon }) => <button key={id} type="button" aria-pressed={selectedHazards.includes(id)} onClick={() => onToggleHazard(id)} data-testid={`hazard-filter-${id}`} className={`${workspaceAction} shrink-0 rounded-full ${selectedHazards.includes(id) ? pressedClass : ""}`}><Icon size={16} aria-hidden="true" />{shortLabel} ({reports.filter((report) => resolveHazardCategory(report) === id).length})</button>)}
    </div>
    <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Map presentation and verification filters">
      <button type="button" aria-pressed={showHeatmap} onClick={onToggleHeatmap} data-testid="heatmap-layer-toggle" className={`${workspaceAction} ${showHeatmap ? pressedClass : ""}`}>Density overlay</button>
      <button type="button" aria-pressed={pendingMode === "confirmed"} onClick={() => onChangePendingMode("confirmed")} className={`${workspaceAction} ${pendingMode === "confirmed" ? pressedClass : ""}`}>Human confirmed ({confirmedCount})</button>
      <button type="button" aria-pressed={pendingMode === "all"} onClick={() => onChangePendingMode("all")} className={`${workspaceAction} ${pendingMode === "all" ? pressedClass : ""}`}>Include pending</button>
      {onChangeViewMode && <><button type="button" aria-pressed={viewMode === "map"} onClick={() => onChangeViewMode("map")} className={`${workspaceAction} ${viewMode === "map" ? pressedClass : ""}`}><MapIcon size={16} aria-hidden="true" />Map view</button><button type="button" aria-pressed={viewMode === "split"} onClick={() => onChangeViewMode("split")} className={`${workspaceAction} ${viewMode === "split" ? pressedClass : ""}`}><LayoutGrid size={16} aria-hidden="true" />Split view</button></>}
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-rule pt-3" role="group" aria-label="Provisional severity filters">
      <span className="text-sm text-[var(--ink-2)]">Provisional severity</span>
      <button type="button" aria-pressed={!selectedSeverities.length} onClick={() => onSelectSeverityPreset([])} className={`${workspaceAction} ${!selectedSeverities.length ? pressedClass : ""}`}>All severities</button>
      {SEVERITY_LEVELS.map(({ level, label }) => <button key={level} type="button" aria-label={label} aria-pressed={selectedSeverities.includes(level)} onClick={() => onToggleSeverity(level)} data-testid={`severity-filter-${level}`} className={`${workspaceAction} ${selectedSeverities.includes(level) ? pressedClass : ""}`}>{level}</button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[var(--ink-2)]" role="status">{visibleCount} matching mapped reports · filter counts use the loaded window</p>{hasActiveFilters && <button type="button" className={workspaceAction} onClick={onResetAllFilters}>Reset all filters</button>}</div>
  </section>;
}
