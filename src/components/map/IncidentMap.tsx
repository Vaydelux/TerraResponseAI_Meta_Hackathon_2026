// src/components/map/IncidentMap.tsx
//
// The MapLibre GL JS map. The map shell is a full-bleed MapLibre
// canvas with a floating right panel (bottom sheet on mobile). Per
// docs/DESIGN.md §6:
//
//   - For <300 incidents: HTML markers (IncidentPin).
//   - For ≥300: GeoJSON circle layers with clustering.
//   - A "Show pending review" toggle (`.map-toggle` segmented
//     control) at top-left that animates hatched pins in/out (200ms
//     fade).
//   - Default: only confirmed incidents. Toggling adds pending.
//   - Selecting a pin opens IncidentPanel (floating right on
//     desktop, bottom sheet on mobile).
//   - A legend (`.legend`) at bottom-left.
//   - Re-fetch on map move (debounced) via /api/reports/viewport.
//
// Light "survey" style: land #E9EDE8, water #CFE0E6, roads #FFFFFF
// with #C9D1CB casing, labels in Public Sans. Inline style JSON.
//
// Client component — MapLibre needs the canvas.

"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { IncidentPin } from "./IncidentPin";
import { MapLegend } from "./MapLegend";
import { IncidentPanel, type IncidentPanelData } from "./IncidentPanel";
import { Segmented } from "@/components/ui-tr/Segmented";
import { COPY } from "@/lib/design/copy";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { cn } from "@/lib/utils";

export interface IncidentMapReport {
  id: string;
  title: string | null;
  status: string;
  review_outcome: string | null;
  latitude: number;
  longitude: number;
  priority_score: number | null;
  severity?: number;
  retention_state?: string;
  description?: string | null;
  location_label?: string | null;
  uploaded_at?: string;
  incidentType?: string | null;
  summary?: string | null;
}

export interface IncidentMapProps {
  eventId: string;
  reports: IncidentMapReport[];
  className?: string;
}

// A minimal inline MapLibre style. The "survey" palette per the
// design thesis — quiet land, light water, white roads with a
// graphite casing. Labels use Public Sans via the fontstack.
function buildSurveyStyle() {
  return {
    version: 8 as const,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "osm-tiles": {
        type: "raster" as const,
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "background",
        type: "background" as const,
        paint: { "background-color": "#E9EDE8" },
      },
      {
        id: "tiles",
        type: "raster" as const,
        source: "osm-tiles",
        paint: {
          "raster-saturation": -0.4,
          "raster-contrast": 0.05,
          "raster-opacity": 0.85,
        },
      },
    ],
  };
}

type PendingMode = "confirmed" | "all";

export function IncidentMap({ eventId, reports, className }: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const [pendingMode, setPendingMode] = useState<PendingMode>("confirmed");
  const [selected, setSelected] = useState<IncidentMapReport | null>(null);
  const [liveReports, setLiveReports] = useState<IncidentMapReport[]>(reports);

  // Clear selected incident and stale pins when the active event changes.
  useEffect(() => {
    queueMicrotask(() => {
      setSelected(null);
      setLiveReports(reports);
    });
  }, [eventId, reports]);

  // Initialize the map once per active event.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildSurveyStyle(),
      center: [121, 14.6],
      zoom: 11,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // Re-fetch on move (debounced).
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    function onMove() {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(async () => {
        if (!eventId) return;
        fetchControllerRef.current?.abort();
        const controller = new AbortController();
        fetchControllerRef.current = controller;
        const b = map.getBounds();
        const params = new URLSearchParams({
          event_id: eventId,
          sw_lat: b.getSouth().toFixed(6),
          sw_lon: b.getWest().toFixed(6),
          ne_lat: b.getNorth().toFixed(6),
          ne_lon: b.getEast().toFixed(6),
          limit: "200",
        });
        try {
          const res = await fetch(`/api/reports/viewport?${params}`, { signal: controller.signal });
          if (!res.ok) return;
          const body = await res.json();
          if (!controller.signal.aborted && body?.ok && Array.isArray(body.reports)) {
            setLiveReports(body.reports as IncidentMapReport[]);
          }
        } catch {
          // ignore — keep the previous reports
        }
      }, 400);
    }
    map.on("moveend", onMove);
    return () => {
      if (moveTimer) clearTimeout(moveTimer);
      fetchControllerRef.current?.abort();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [eventId]);

  // Render HTML markers when reports or pendingMode change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = liveReports.filter((r) => {
      if (r.retention_state && r.retention_state !== "active") return false;
      if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) ||
          Math.abs(r.latitude) > 90 || Math.abs(r.longitude) > 180) return false;
      if (pendingMode === "confirmed") {
        const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
        return state === "confirmed" || state === "corrected";
      }
      return true;
    });

    for (const r of visible) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.opacity = "0";
      el.style.transition = "opacity 200ms ease";
      // Create DOM safely without interpolating API data into innerHTML.
      const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
      const sev = toSeverityLevel(r.severity);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pin";
      button.dataset.state = state;
      button.dataset.sev = String(sev);
      button.setAttribute("aria-label", `${r.title || "Incident"}; ${state}; severity ${sev}`);
      button.addEventListener("click", () => setSelected(r));
      el.append(button);
      const marker = new maplibregl.Marker(el)
        .setLngLat([r.longitude, r.latitude])
        .addTo(map);
      markersRef.current.push(marker);
      // Fade in (200ms).
      requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
    }
  }, [liveReports, pendingMode]);

  const panelReport: IncidentPanelData | null = selected
    ? {
        id: selected.id,
        status: selected.status,
        review_outcome: selected.review_outcome,
        title: selected.title,
        description: selected.description ?? null,
        latitude: selected.latitude,
        longitude: selected.longitude,
        location_label: selected.location_label ?? null,
        uploaded_at: selected.uploaded_at ?? new Date().toISOString(),
        priority_score: selected.priority_score ?? null,
        severity: selected.severity ?? null,
        incidentType: selected.incidentType ?? null,
        summary: selected.summary ?? null,
      }
    : null;

  return (
    <div className={cn("map", className)} ref={containerRef}>
      <div className="map-toggle">
        <Segmented<PendingMode>
          aria-label={COPY.mapShowPending}
          options={[
            { value: "confirmed", label: "Confirmed" },
            { value: "all", label: COPY.mapShowPending },
          ]}
          value={pendingMode}
          onChange={setPendingMode}
        />
      </div>
      <MapLegend showPending={pendingMode === "all"} />
      {panelReport && (
        <IncidentPanel report={panelReport} />
      )}
    </div>
  );
}
