"use client";

// src/components/map/MapFilterBar.tsx
//
// Persistent filter bar at the top of the Map view. Allows responders
// to toggle visibility of incident pins by:
//   1. Hazard Category (Flood, Fire, Medical, Structural, Blocked Road, Debris)
//   2. Severity Level (Sev 1–5 individual toggles + Critical 4–5 preset)
//   3. Verification State (Confirmed only vs. All including pending review)
//
// Updates visible map pins, D3 summary chart, and situational rail in real time.

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
} from "lucide-react";
import { Segmented } from "@/components/ui-tr/Segmented";
import { COPY } from "@/lib/design/copy";
import { toSeverityLevel } from "@/lib/design/severity";
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
}

export const MAP_HAZARD_CATEGORIES: HazardCategoryDef[] = [
  { id: "flooding", label: "Flood", shortLabel: "Flood", icon: Waves },
  { id: "fire", label: "Fire & Hazmat", shortLabel: "Fire", icon: Flame },
  { id: "medical", label: "Medical & Rescue", shortLabel: "Medical", icon: HeartPulse },
  {
    id: "visible_structural_damage",
    label: "Structural Damage",
    shortLabel: "Structural",
    icon: Building2,
  },
  { id: "blocked_road", label: "Blocked Road", shortLabel: "Road", icon: AlertOctagon },
  { id: "debris", label: "Debris", shortLabel: "Debris", icon: Construction },
];

/**
 * Classifies an incident report into one of the map hazard categories.
 * Uses the structured `incidentType` when available and also inspects
 * title/description/summary text for Fire, Medical, or Flood keywords
 * so field reports match intuitive responder categories.
 */
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
  { level: 5, label: "Severity 5 (Critical)", short: "Sev 5 · Critical", tone: "var(--brick)" },
  { level: 4, label: "Severity 4 (High)", short: "Sev 4 · High", tone: "var(--amber)" },
  { level: 3, label: "Severity 3 (Moderate)", short: "Sev 3 · Mod", tone: "var(--tide)" },
  { level: 2, label: "Severity 2 (Low)", short: "Sev 2 · Low", tone: "var(--sev-2)" },
  { level: 1, label: "Severity 1 (Minimal)", short: "Sev 1 · Min", tone: "var(--graphite)" },
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
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
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
  hasActiveFilters,
  onResetAllFilters,
}: MapFilterBarProps) {
  const allHazardsActive = selectedHazards.length === 0;
  const allSeveritiesActive = selectedSeverities.length === 0 || selectedSeverities.length === 5;
  const isCriticalOnly =
    selectedSeverities.length === 2 &&
    selectedSeverities.includes(4) &&
    selectedSeverities.includes(5);

  return (
    <section
      className="map-filter-bar"
      aria-label="Persistent map incident filter bar"
      data-testid="map-filter-bar"
    >
      {/* Row 1: Hazard Category Toggles + Heatmap Toggle + Verification State */}
      <div className="map-filter-bar__row">
        <div className="map-filter-bar__group">
          <span className="map-filter-bar__group-label">
            <Layers size={14} aria-hidden="true" style={{ color: "var(--tide)" }} />
            <span>Hazard Category:</span>
          </span>

          <div
            className="tactical-layer-bar"
            role="group"
            aria-label="Filter incidents by hazard category"
          >
            <button
              type="button"
              className="tactical-layer-btn"
              aria-pressed={allHazardsActive}
              onClick={onResetHazards}
            >
              <Layers size={15} aria-hidden="true" />
              <span>All Hazards</span>
              <span className="num" style={{ opacity: 0.85 }}>
                ({reports.length})
              </span>
            </button>

            {MAP_HAZARD_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedHazards.includes(cat.id);
              const count = reports.filter((r) => resolveHazardCategory(r) === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="tactical-layer-btn"
                  aria-pressed={isSelected}
                  onClick={() => onToggleHazard(cat.id)}
                  data-testid={`hazard-filter-${cat.id}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{cat.label}</span>
                  <span className="num" style={{ opacity: 0.85 }}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="map-heatmap-btn"
            aria-pressed={showHeatmap}
            onClick={onToggleHeatmap}
            data-testid="heatmap-layer-toggle"
            title="Overlay a gradient density heatmap to spot emerging incident hotspots"
          >
            <span className="map-heatmap-btn__swatch" aria-hidden="true" />
            <span>Heatmap</span>
          </button>

          <Segmented<PendingFilterMode>
            aria-label={COPY.mapShowPending}
            options={[
              { value: "confirmed", label: `Confirmed (${confirmedCount})` },
              { value: "all", label: `${COPY.mapShowPending} (${visibleCount})` },
            ]}
            value={pendingMode}
            onChange={onChangePendingMode}
          />
        </div>
      </div>

      {/* Row 2: Severity Level Toggles + Live Count & Reset */}
      <div className="map-filter-bar__row map-filter-bar__row--secondary">
        <div className="map-filter-bar__group">
          <span className="map-filter-bar__group-label">
            <SlidersHorizontal size={14} aria-hidden="true" style={{ color: "var(--tide)" }} />
            <span>Severity Level:</span>
          </span>

          <div
            className="map-severity-bar"
            role="group"
            aria-label="Filter incidents by severity level"
          >
            <button
              type="button"
              className="map-sev-pill"
              aria-pressed={allSeveritiesActive}
              onClick={() => onSelectSeverityPreset([])}
            >
              All Severities
            </button>

            <button
              type="button"
              className="map-sev-pill"
              aria-pressed={isCriticalOnly}
              onClick={() =>
                onSelectSeverityPreset(isCriticalOnly ? [] : [4, 5])
              }
              title="Show only High & Critical incidents (Severity 4 and 5)"
            >
              <FlameKindling size={13} aria-hidden="true" style={{ color: "var(--brick)" }} />
              <span>Critical (Sev 4–5)</span>
            </button>

            {SEVERITY_LEVELS.map((sev) => {
              const isPressed = selectedSeverities.includes(sev.level);
              const count = reports.filter(
                (r) => toSeverityLevel(r.severity) === sev.level,
              ).length;
              return (
                <button
                  key={sev.level}
                  type="button"
                  className="map-sev-pill num"
                  aria-pressed={isPressed}
                  aria-label={sev.label}
                  onClick={() => onToggleSeverity(sev.level)}
                  data-testid={`severity-filter-${sev.level}`}
                >
                  <span
                    aria-hidden="true"
                    className="map-sev-pill__dot"
                    style={{ background: sev.tone }}
                  />
                  <span>{sev.short}</span>
                  <span style={{ opacity: 0.78 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="map-filter-bar__status num">
          <span>
            Showing <strong>{visibleCount}</strong> of <strong>{reports.length}</strong> pins
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn"
              onClick={onResetAllFilters}
              style={{ minHeight: 30, padding: "0 10px", fontSize: "0.76rem" }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset all filters
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
