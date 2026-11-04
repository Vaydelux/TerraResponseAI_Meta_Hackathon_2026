// src/components/map/MapFilterBar.tsx
//
// Persistent filter bar for the Tactical Incident Map using shadcn & Lucide:
//   1. Search Input with instant query filter
//   2. Hazard Category pills with colored dot indicators & counts
//   3. View mode switcher (Map View vs. Split / List View)
//   4. Severity Level (Sev 1–5 individual toggles + Critical 4–5 preset)
//   5. Heatmap overlay toggle & Verification State segmented filter
//   6. 100% opaque, high-contrast surface to prevent sticky scroll bleed-through.

"use client";

import {
  Waves,
  Flame,
  HeartPulse,
  Building2,
  AlertOctagon,
  Construction,
  Layers,
  SlidersHorizontal,
  RotateCcw,
  FlameKindling,
  Search,
  Map as MapIcon,
  LayoutGrid,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui-tr/Segmented";
import { COPY } from "@/lib/design/copy";
import { toSeverityLevel } from "@/lib/design/severity";
import { cn } from "@/lib/utils";
import type { IncidentMapReport } from "./IncidentMap";

export type HazardCategoryId =
  | "flooding"
  | "fire"
  | "medical"
  | "visible_structural_damage"
  | "blocked_road"
  | "debris"
  | "other";

export type PendingFilterMode = "confirmed" | "all";

export interface HazardCategoryDef {
  id: HazardCategoryId;
  label: string;
  shortLabel: string;
  icon: typeof Layers;
  dotColor: string;
}

export const MAP_HAZARD_CATEGORIES: HazardCategoryDef[] = [
  { id: "flooding", label: "Flood", shortLabel: "Flood", icon: Waves, dotColor: "#38bdf8" },
  { id: "fire", label: "Fire & Hazmat", shortLabel: "Fire", icon: Flame, dotColor: "#f87171" },
  { id: "medical", label: "Medical & Rescue", shortLabel: "Medical", icon: HeartPulse, dotColor: "#fb7185" },
  {
    id: "visible_structural_damage",
    label: "Structural Damage",
    shortLabel: "Structural",
    icon: Building2,
    dotColor: "#fb923c",
  },
  { id: "blocked_road", label: "Blocked Road", shortLabel: "Road", icon: AlertOctagon, dotColor: "#facc15" },
  { id: "debris", label: "Debris", shortLabel: "Debris", icon: Construction, dotColor: "#a3e635" },
];

export function resolveHazardCategory(report: IncidentMapReport): HazardCategoryId {
  const rawType = (report.incidentType ?? "").toLowerCase().trim();
  if (rawType === "flooding" || rawType === "flood") return "flooding";
  if (rawType === "fire" || rawType === "wildfire" || rawType === "hazmat") return "fire";
  if (rawType === "medical" || rawType === "casualty" || rawType === "rescue") return "medical";
  if (rawType === "visible_structural_damage" || rawType === "structural") {
    return "visible_structural_damage";
  }
  if (rawType === "blocked_road") return "blocked_road";
  if (rawType === "debris") return "debris";

  const haystack = `${report.title ?? ""} ${report.description ?? ""} ${report.summary ?? ""}`.toLowerCase();
  if (/\b(fire|smoke|blaze|burn|hazmat|explosion|flam)\b/.test(haystack)) {
    return "fire";
  }
  if (/\b(medical|injur|casualt|triage|ambulance|paramedic|hospital|rescue|trapped|stranded)\b/.test(haystack)) {
    return "medical";
  }
  if (/\b(flood|inundat|water level|submerg|surge)\b/.test(haystack)) {
    return "flooding";
  }
  if (/\b(collapse|structural|bridge|building|crack|roof)\b/.test(haystack)) {
    return "visible_structural_damage";
  }
  if (/\b(blocked|road|highway|route|impassable|lane)\b/.test(haystack)) {
    return "blocked_road";
  }
  if (/\b(debris|tree|rubble|landslide|mudslide|downed)\b/.test(haystack)) {
    return "debris";
  }

  return "other";
}

export const SEVERITY_LEVELS: Array<{
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  short: string;
  tone: string;
}> = [
  { level: 5, label: "Severity 5 (Critical)", short: "Sev 5 · Critical", tone: "#ef4444" },
  { level: 4, label: "Severity 4 (High)", short: "Sev 4 · High", tone: "#f97316" },
  { level: 3, label: "Severity 3 (Moderate)", short: "Sev 3 · Mod", tone: "#06b6d4" },
  { level: 2, label: "Severity 2 (Low)", short: "Sev 2 · Low", tone: "#3b82f6" },
  { level: 1, label: "Severity 1 (Minimal)", short: "Sev 1 · Min", tone: "#64748b" },
];

export interface MapFilterBarProps {
  reports: IncidentMapReport[];
  visibleCount: number;
  confirmedCount: number;
  selectedHazards: HazardCategoryId[];
  onToggleHazard: (category: HazardCategoryId) => void;
  onResetHazards: () => void;
  selectedSeverities: number[];
  onToggleSeverity: (severity: number) => void;
  onSelectSeverityPreset: (levels: number[]) => void;
  pendingMode: PendingFilterMode;
  onChangePendingMode: (mode: PendingFilterMode) => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  searchQuery?: string;
  onChangeSearchQuery?: (q: string) => void;
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
  viewMode?: "map" | "split";
  onChangeViewMode?: (mode: "map" | "split") => void;
  className?: string;
}

export function MapFilterBar({
  reports,
  visibleCount,
  confirmedCount,
  selectedHazards,
  onToggleHazard,
  onResetHazards,
  selectedSeverities,
  onToggleSeverity,
  onSelectSeverityPreset,
  pendingMode,
  onChangePendingMode,
  showHeatmap,
  onToggleHeatmap,
  searchQuery = "",
  onChangeSearchQuery,
  hasActiveFilters,
  onResetAllFilters,
  viewMode = "split",
  onChangeViewMode,
  className,
}: MapFilterBarProps) {
  const allHazardsActive = selectedHazards.length === 0;
  const allSeveritiesActive = selectedSeverities.length === 0 || selectedSeverities.length === 5;
  const isCriticalOnly =
    selectedSeverities.length === 2 &&
    selectedSeverities.includes(4) &&
    selectedSeverities.includes(5);

  return (
    <section
      className={cn(
        "tactical-filter-bar w-full rounded-2xl",
        "bg-slate-950 dark:bg-[#0B141A] border border-slate-800",
        "shadow-lg text-slate-100 p-3 sm:p-4 flex flex-col gap-3",
        className,
      )}
      aria-label="Tactical incident map filters"
      data-testid="map-filter-bar"
    >
      {/* Row 1: Search + Hazard Category Pills + Heatmap + View Switcher */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left Side: Search + Hazard Pills */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
          {onChangeSearchQuery && (
            <div className="relative w-full sm:w-[260px] md:w-[280px] shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                placeholder="Search location, street, or incident #…"
                aria-label="Search map incidents"
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onChangeSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Hazard Category Pills (Horizontally scrollable on mobile) */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar flex-1 min-w-0"
            role="group"
            aria-label="Filter incidents by hazard category"
          >
            <Button
              type="button"
              variant={allHazardsActive ? "default" : "outline"}
              size="sm"
              onClick={onResetHazards}
              className={cn(
                "h-8 px-3 rounded-xl text-xs font-semibold shrink-0 transition-all",
                allHazardsActive
                  ? "bg-teal-600 hover:bg-teal-500 text-white border-0 shadow-sm"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <Layers className="size-3.5 mr-1 text-teal-300" />
              <span>All Hazards</span>
              <span className="ml-1 opacity-80 text-[11px] font-mono">({reports.length})</span>
            </Button>

            {MAP_HAZARD_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedHazards.includes(cat.id);
              const count = reports.filter((r) => resolveHazardCategory(r) === cat.id).length;
              return (
                <Button
                  key={cat.id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => onToggleHazard(cat.id)}
                  data-testid={`hazard-filter-${cat.id}`}
                  className={cn(
                    "h-8 px-2.5 rounded-xl text-xs font-medium shrink-0 transition-all",
                    isSelected
                      ? "bg-teal-600 hover:bg-teal-500 text-white border-0 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <span
                    className="size-2 rounded-full mr-1.5 shrink-0"
                    style={{ backgroundColor: cat.dotColor }}
                    aria-hidden="true"
                  />
                  <span>{cat.shortLabel}</span>
                  <span className="ml-1 opacity-70 text-[11px] font-mono">({count})</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Heatmap + Pending Toggle + View Mode Toggle */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Heatmap Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleHeatmap}
            data-testid="heatmap-layer-toggle"
            title="Overlay density heatmap"
            className={cn(
              "h-8 px-2.5 rounded-xl text-xs font-semibold border-slate-800 transition-all",
              showHeatmap
                ? "bg-amber-600 hover:bg-amber-500 text-white border-0"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
          >
            <span
              className="size-2.5 rounded-full mr-1.5 shrink-0 shadow-sm"
              style={{
                background: "radial-gradient(circle, #E0675B 0%, #E8A317 50%, #0E6F7D 100%)",
              }}
              aria-hidden="true"
            />
            <span>Heatmap</span>
          </Button>

          {/* Verification Mode Segmented Control */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center">
            <button
              type="button"
              onClick={() => onChangePendingMode("confirmed")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                pendingMode === "confirmed"
                  ? "bg-slate-800 text-teal-400 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              Confirmed ({confirmedCount})
            </button>
            <button
              type="button"
              onClick={() => onChangePendingMode("all")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                pendingMode === "all"
                  ? "bg-slate-800 text-teal-400 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              All / Pending ({visibleCount})
            </button>
          </div>

          {/* View Mode Toggle: Map View vs Split Rail View (matching reference screenshot) */}
          {onChangeViewMode && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center">
              <button
                type="button"
                onClick={() => onChangeViewMode("map")}
                title="Full-width Map View"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                  viewMode === "map"
                    ? "bg-teal-600 text-white font-semibold shadow-xs"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <MapIcon className="size-3.5" />
                <span className="hidden sm:inline">Map View</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode("split")}
                title="Split View with Situational Rail"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                  viewMode === "split"
                    ? "bg-teal-600 text-white font-semibold shadow-xs"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">Split View</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Severity Level Toggles + Live Count Readout & Reset Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mr-1">
            <SlidersHorizontal className="size-3.5 text-teal-400" />
            <span>Severity Level:</span>
          </span>

          <Button
            type="button"
            variant={allSeveritiesActive ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectSeverityPreset([])}
            className={cn(
              "h-7 px-2.5 rounded-lg text-xs font-medium transition-all",
              allSeveritiesActive
                ? "bg-teal-600 hover:bg-teal-500 text-white border-0"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
          >
            All Severities
          </Button>

          <Button
            type="button"
            variant={isCriticalOnly ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectSeverityPreset(isCriticalOnly ? [] : [4, 5])}
            title="Show only Critical (Severity 4 and 5)"
            className={cn(
              "h-7 px-2.5 rounded-lg text-xs font-semibold transition-all",
              isCriticalOnly
                ? "bg-red-600 hover:bg-red-500 text-white border-0"
                : "bg-slate-900 border-slate-800 text-red-400 hover:bg-slate-800",
            )}
          >
            <FlameKindling className="size-3 mr-1 text-red-400" />
            <span>Critical (Sev 4–5)</span>
          </Button>

          {SEVERITY_LEVELS.map((sev) => {
            const isPressed = selectedSeverities.includes(sev.level);
            const count = reports.filter(
              (r) => toSeverityLevel(r.severity) === sev.level,
            ).length;
            return (
              <Button
                key={sev.level}
                type="button"
                variant={isPressed ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleSeverity(sev.level)}
                data-testid={`severity-filter-${sev.level}`}
                className={cn(
                  "h-7 px-2 rounded-lg text-[11px] font-medium transition-all",
                  isPressed
                    ? "bg-teal-600 hover:bg-teal-500 text-white border-0"
                    : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <span
                  className="size-1.5 rounded-full mr-1.5 shrink-0"
                  style={{ backgroundColor: sev.tone }}
                  aria-hidden="true"
                />
                <span>{sev.short}</span>
                <span className="ml-1 opacity-70 font-mono">({count})</span>
              </Button>
            );
          })}
        </div>

        {/* Status Count & Reset Button */}
        <div className="flex items-center gap-2 self-end sm:self-center text-xs text-slate-400 shrink-0">
          <span>
            Showing <strong className="text-white font-bold">{visibleCount}</strong> of{" "}
            <strong className="text-white font-bold">{reports.length}</strong> pins
          </span>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetAllFilters}
              className="h-7 px-2 rounded-lg text-xs border-slate-700 bg-slate-900 text-teal-400 hover:bg-slate-800"
            >
              <RotateCcw className="size-3 mr-1" />
              Reset all
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
