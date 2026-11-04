// src/components/map/IncidentMap.tsx
//
// Responsive Incident Map & Situational Workspace. Combines the
// MapLibre GL JS canvas (with automatic Day / Night Ops style
// switching), a persistent top MapFilterBar (with multi-toggle
// Hazard Categories, Severity Level 1–5 toggles, and a gradient
// Heatmap density layer toggle), D3 quadtree spatial pin clustering,
// a bottom TemporalScrubber that filters pins by `uploaded_at`
// timestamp, a selected IncidentPanel drawer, and the Right
// Situational Rail with D3 HazardSummaryChart and high-resolution
// PNG Map Snapshot export.
//
// Security invariant: creates marker DOM via document.createElement("button")
// and never interpolates API data into innerHTML.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { animate } from "framer-motion";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Navigation,
  ArrowUpRight,
  Upload,
  CheckSquare,
  FileText,
  Compass,
  Download,
  Check,
  Plus,
  Minus,
  LocateFixed,
  Layers,
  ShieldAlert,
  Flame,
  Waves,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapLegend } from "./MapLegend";
import { IncidentPanel, type IncidentPanelData } from "./IncidentPanel";
import { PIN_HAZARD_SHORT_LABEL } from "./IncidentPin";
import { HazardSummaryChart } from "./HazardSummaryChart";
import { ShareReportButton } from "@/components/report/ShareReportButton";
import {
  MapFilterBar,
  resolveHazardCategory,
  type HazardCategoryId,
  type PendingFilterMode,
} from "./MapFilterBar";
import { TemporalScrubber } from "./TemporalScrubber";
import { RegionalAlertOverlay } from "./RegionalAlertOverlay";
import type { RegionalHazardAlert } from "@/app/api/map/alerts/route";
import { clusterIncidentsWithD3 } from "./d3Cluster";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { readInitialTheme, resolveIsNight } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

/** Zoom threshold at or above which custom hazard type text labels are shown on map pins. */
const ZOOM_HAZARD_LABEL_THRESHOLD = 12;

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
  eventName?: string;
  canReview?: boolean;
  reports: IncidentMapReport[];
  className?: string;
}

function buildSurveyStyle(isNight: boolean) {
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
        paint: { "background-color": isNight ? "#0B141A" : "#E9EDE8" },
      },
      {
        id: "tiles",
        type: "raster" as const,
        source: "osm-tiles",
        paint: {
          "raster-saturation": isNight ? -0.75 : -0.4,
          "raster-contrast": isNight ? 0.25 : 0.05,
          "raster-brightness-max": isNight ? 0.42 : 1.0,
          "raster-brightness-min": isNight ? 0.04 : 0.0,
          "raster-opacity": 0.88,
        },
      },
    ],
  };
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flooding & Inundation",
  fire: "Fire & Hazmat",
  medical: "Medical & Rescue",
  blocked_road: "Blocked Roadway",
  debris: "Debris Field",
  visible_structural_damage: "Structural Damage",
  other: "Field Observation",
  unclear: "Unclassified",
};

/**
 * Draws a gradient-based density heatmap of `reports` onto a 2D canvas
 * using `projectFn` to map `[lon, lat]` to `[x, y]` pixel coordinates.
 */
function paintHeatmapOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  reports: IncidentMapReport[],
  projectFn: (lon: number, lat: number) => { x: number; y: number },
  scaleFactor = 1,
) {
  ctx.clearRect(0, 0, width, height);
  if (reports.length === 0) return;

  ctx.save();
  for (const r of reports) {
    const pt = projectFn(r.longitude, r.latitude);
    const x = pt.x * scaleFactor;
    const y = pt.y * scaleFactor;
    if (x < -120 || y < -120 || x > width + 120 || y > height + 120) continue;

    const sev = toSeverityLevel(r.severity);
    const radius = (48 + sev * 14) * scaleFactor;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);

    if (sev >= 4) {
      grad.addColorStop(0, "rgba(209, 77, 59, 0.58)");
      grad.addColorStop(0.38, "rgba(232, 163, 23, 0.38)");
      grad.addColorStop(0.72, "rgba(14, 111, 125, 0.18)");
      grad.addColorStop(1, "rgba(14, 111, 125, 0)");
    } else if (sev === 3) {
      grad.addColorStop(0, "rgba(232, 163, 23, 0.50)");
      grad.addColorStop(0.45, "rgba(33, 131, 88, 0.28)");
      grad.addColorStop(0.8, "rgba(11, 101, 116, 0.12)");
      grad.addColorStop(1, "rgba(11, 101, 116, 0)");
    } else {
      grad.addColorStop(0, "rgba(33, 131, 88, 0.44)");
      grad.addColorStop(0.5, "rgba(11, 101, 116, 0.24)");
      grad.addColorStop(1, "rgba(11, 101, 116, 0)");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function IncidentMap({
  eventId,
  eventName,
  canReview = false,
  reports,
  className,
}: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const [pendingMode, setPendingMode] = useState<PendingFilterMode>("all");
  const [selectedHazards, setSelectedHazards] = useState<HazardCategoryId[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scrubberPct, setScrubberPct] = useState<number>(100);
  const [selected, setSelected] = useState<IncidentMapReport | null>(reports[0] ?? null);
  const [liveReports, setLiveReports] = useState<IncidentMapReport[]>(reports);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({
    lat: reports[0]?.latitude ?? 14.6,
    lon: reports[0]?.longitude ?? 121.0,
  });
  const [snapshotStatus, setSnapshotStatus] = useState<"idle" | "rendering" | "saved">("idle");
  const [viewMode, setViewMode] = useState<"map" | "split">("split");

  function handleZoomIn() {
    mapRef.current?.zoomIn({ duration: 300 });
  }
  function handleZoomOut() {
    mapRef.current?.zoomOut({ duration: 300 });
  }
  function handleRecenter() {
    if (reports[0] && Number.isFinite(reports[0].latitude)) {
      mapRef.current?.flyTo({ center: [reports[0].longitude, reports[0].latitude], zoom: 12, duration: 600 });
    } else {
      mapRef.current?.flyTo({ center: [121.0, 14.6], zoom: 11, duration: 600 });
    }
  }

  // Localized weather/seismic alert state fetched from Google Search Grounding on region pan
  const [regionalAlert, setRegionalAlert] = useState<RegionalHazardAlert | null>(null);
  const [alertLoading, setAlertLoading] = useState<boolean>(false);
  const [alertDismissed, setAlertDismissed] = useState<boolean>(false);
  const lastAlertCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  const alertAbortRef = useRef<AbortController | null>(null);

  const fetchRegionalAlertForCoords = useCallback(
    async (lat: number, lon: number, forceShow = false) => {
      alertAbortRef.current?.abort();
      const ctrl = new AbortController();
      alertAbortRef.current = ctrl;

      setAlertLoading(true);
      if (forceShow) {
        setAlertDismissed(false);
      }

      try {
        const params = new URLSearchParams({
          lat: lat.toFixed(4),
          lon: lon.toFixed(4),
        });
        const res = await fetch(`/api/map/alerts?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!ctrl.signal.aborted && body?.ok && body.alert) {
          setRegionalAlert(body.alert as RegionalHazardAlert);
          setAlertDismissed(false);
          lastAlertCenterRef.current = { lat, lon };
        }
      } catch {
        // Ignore aborted or network errors
      } finally {
        if (!ctrl.signal.aborted) {
          setAlertLoading(false);
        }
      }
    },
    [],
  );

  // Fetch initial regional alert on mount
  useEffect(() => {
    const initLat = reports[0]?.latitude ?? 14.6;
    const initLon = reports[0]?.longitude ?? 121.0;
    lastAlertCenterRef.current = { lat: initLat, lon: initLon };
    // Existing mount-time fetch intentionally updates request status from its callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRegionalAlertForCoords(initLat, initLon, false);
    return () => {
      alertAbortRef.current?.abort();
    };
  }, [eventId, reports, fetchRegionalAlertForCoords]);

  // Clear selected incident and stale pins when the active event changes.
  useEffect(() => {
    queueMicrotask(() => {
      setSelected(reports[0] ?? null);
      setLiveReports(reports);
      setScrubberPct(100);
    });
  }, [eventId, reports]);

  // Toggle a single hazard category in the multi-select filter
  function handleToggleHazard(category: HazardCategoryId) {
    setSelectedHazards((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  // Toggle a single severity level (1–5) in the multi-select filter
  function handleToggleSeverity(sev: number) {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
    );
  }

  function handleResetAllFilters() {
    setSelectedHazards([]);
    setSelectedSeverities([]);
    setPendingMode("all");
    setSearchQuery("");
    setScrubberPct(100);
  }

  // Compute min/max timestamps for the TemporalScrubber from `uploaded_at`
  const timeBounds = useMemo(() => {
    const times = liveReports
      .map((r) => (r.uploaded_at ? new Date(r.uploaded_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) {
      const now = Date.now();
      return { min: now - 6 * 3600_000, max: now };
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min: min === max ? min - 3600_000 : min, max };
  }, [liveReports]);

  const cutoffTimestamp = useMemo(() => {
    if (scrubberPct >= 100) return Infinity;
    return timeBounds.min + ((timeBounds.max - timeBounds.min) * scrubberPct) / 100;
  }, [scrubberPct, timeBounds]);

  // Filter reports by verification mode, hazard categories, severity levels, and `uploaded_at` scrubber
  const visibleReports = useMemo(() => {
    return liveReports.filter((r) => {
      if (r.retention_state && r.retention_state !== "active") return false;
      if (
        !Number.isFinite(r.latitude) ||
        !Number.isFinite(r.longitude) ||
        Math.abs(r.latitude) > 90 ||
        Math.abs(r.longitude) > 180
      ) {
        return false;
      }
      if (pendingMode === "confirmed") {
        const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
        if (state !== "confirmed" && state !== "corrected") return false;
      }
      if (selectedHazards.length > 0) {
        const cat = resolveHazardCategory(r);
        if (!selectedHazards.includes(cat)) return false;
      }
      if (selectedSeverities.length > 0 && selectedSeverities.length < 5) {
        const sev = toSeverityLevel(r.severity);
        if (!selectedSeverities.includes(sev)) return false;
      }
      if (scrubberPct < 100 && r.uploaded_at) {
        const ts = new Date(r.uploaded_at).getTime();
        if (Number.isFinite(ts) && ts > cutoffTimestamp) return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${r.title ?? ""} ${r.description ?? ""} ${r.location_label ?? ""} ${r.incidentType ?? ""} ${r.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    liveReports,
    pendingMode,
    selectedHazards,
    selectedSeverities,
    scrubberPct,
    cutoffTimestamp,
    searchQuery,
  ]);

  // Consolidate overlapping pins at lower zoom levels using D3 quadtree clustering
  const clusteredNodes = useMemo(
    () => clusterIncidentsWithD3(visibleReports, mapZoom),
    [visibleReports, mapZoom],
  );

  // Composite key tracking filter & temporal scrubber changes to trigger staggered Framer Motion pin entrance
  const filterAnimationKey = useMemo(
    () =>
      `${pendingMode}|${selectedHazards.join(",")}|${selectedSeverities.join(",")}|${Math.round(scrubberPct)}`,
    [pendingMode, selectedHazards, selectedSeverities, scrubberPct],
  );

  // Sync the 2D gradient heatmap overlay whenever visibleReports, showHeatmap, or camera changes
  const renderHeatmapCanvas = useCallback(() => {
    const canvas = heatmapCanvasRef.current;
    const map = mapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (!showHeatmap || !map) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    paintHeatmapOverlay(
      ctx,
      w,
      h,
      visibleReports,
      (lon, lat) => map.project([lon, lat]),
      1,
    );
  }, [showHeatmap, visibleReports]);

  useEffect(() => {
    renderHeatmapCanvas();
  }, [renderHeatmapCanvas, mapCenter, mapZoom]);

  // Initialize the map once per active event.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const isNight = resolveIsNight(readInitialTheme());
    const initialLat = reports[0]?.latitude ?? 14.6;
    const initialLon = reports[0]?.longitude ?? 121.0;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildSurveyStyle(isNight),
      center: [initialLon, initialLat],
      zoom: 11,
      attributionControl: {},
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // Re-fetch on move (debounced) and update zoom for D3 clustering + heatmap.
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    function onMove() {
      const c = map.getCenter();
      setMapCenter({ lat: c.lat, lon: c.lng });
      setMapZoom(Number(map.getZoom().toFixed(2)));
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

        // Check if the user panned to a new region (>= 0.012 deg ~1.3 km shift)
        const prevAlertCenter = lastAlertCenterRef.current;
        const dist = prevAlertCenter
          ? Math.hypot(c.lat - prevAlertCenter.lat, c.lng - prevAlertCenter.lon)
          : Infinity;
        if (dist >= 0.012) {
          void fetchRegionalAlertForCoords(c.lat, c.lng, true);
        }
      }, 400);
    }

    // Listen to Day / Night Ops theme changes so the basemap updates live
    function onThemeChange(e: Event) {
      const custom = e as CustomEvent<{ isNight: boolean }>;
      const night = custom.detail?.isNight ?? resolveIsNight(readInitialTheme());
      try {
        if (map.getLayer("background")) {
          map.setPaintProperty("background", "background-color", night ? "#0B141A" : "#E9EDE8");
        }
        if (map.getLayer("tiles")) {
          map.setPaintProperty("tiles", "raster-saturation", night ? -0.75 : -0.4);
          map.setPaintProperty("tiles", "raster-contrast", night ? 0.25 : 0.05);
          map.setPaintProperty("tiles", "raster-brightness-max", night ? 0.42 : 1.0);
          map.setPaintProperty("tiles", "raster-brightness-min", night ? 0.04 : 0.0);
        }
      } catch {
        // style not yet loaded
      }
    }

    map.on("move", () => {
      const c = map.getCenter();
      setMapCenter({ lat: c.lat, lon: c.lng });
    });
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    map.on("load", onMove);
    window.addEventListener("tr-theme-change", onThemeChange);
    return () => {
      if (moveTimer) clearTimeout(moveTimer);
      fetchControllerRef.current?.abort();
      window.removeEventListener("tr-theme-change", onThemeChange);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [eventId, reports]);

  // Render HTML markers (single pins + D3 cluster markers) with Framer Motion
  // staggered scale-in entrance animation when filters or temporal scrubber change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const activeAnimations: Array<{ stop: () => void }> = [];

    clusteredNodes.forEach((node, idx) => {
      const el = document.createElement("div");
      el.style.position = "absolute";

      // Staggered entrance delay (35ms per pin, capped at 450ms)
      const staggerDelay = Math.min(idx * 0.035, 0.45);

      if (node.kind === "cluster") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cluster";
        button.dataset.sev = String(node.maxSeverity);
        button.dataset.hasPending = node.pendingCount > 0 ? "true" : "false";
        button.dataset.staggerIndex = String(idx);
        button.setAttribute(
          "aria-label",
          `${node.count} incidents consolidated (${node.confirmedCount} confirmed, ${node.pendingCount} pending) — click to zoom in`,
        );

        const countSpan = document.createElement("span");
        countSpan.className = "cluster__count";
        countSpan.textContent = String(node.count);
        button.append(countSpan);

        const badge = document.createElement("span");
        badge.className = "pin-context-badge";
        badge.textContent = node.locationContext;
        button.append(badge);

        button.addEventListener("click", () => {
          map.flyTo({
            center: [node.longitude, node.latitude],
            zoom: Math.min(15.5, map.getZoom() + 2.2),
            duration: 550,
          });
        });

        el.append(button);
        const marker = new maplibregl.Marker(el)
          .setLngLat([node.longitude, node.latitude])
          .addTo(map);
        markersRef.current.push(marker);

        try {
          const controls = animate(
            button,
            { opacity: [0, 1], scale: [0.35, 1.08, 1] },
            {
              duration: 0.36,
              delay: staggerDelay,
              ease: [0.16, 1, 0.3, 1],
            },
          );
          activeAnimations.push(controls);
        } catch {
          button.style.opacity = "1";
          button.style.transform = "scale(1)";
        }
      } else {
        const r = node.report;
        // Create DOM safely without interpolating API data into innerHTML.
        const state = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
        const sev = toSeverityLevel(r.severity);
        const hazardCategory = resolveHazardCategory(r);
        const hazardLabelText =
          PIN_HAZARD_SHORT_LABEL[hazardCategory] ?? hazardCategory.toUpperCase();
        const isZoomedInForLabels =
          mapZoom >= ZOOM_HAZARD_LABEL_THRESHOLD || selected?.id === r.id;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "pin";
        button.dataset.state = state;
        button.dataset.sev = String(sev);
        button.dataset.hazard = hazardCategory;
        button.dataset.staggerIndex = String(idx);
        if (selected?.id === r.id) {
          button.setAttribute("aria-selected", "true");
        }
        const contextLabel =
          r.location_label ||
          r.title ||
          `${r.latitude.toFixed(3)}° N, ${r.longitude.toFixed(3)}° E`;
        button.setAttribute(
          "aria-label",
          `${r.title || "Incident"}; ${hazardLabelText}; ${state}; severity ${sev}`,
        );

        // Custom hazard-type text label displayed on pins when zoomed in
        const hazardSpan = document.createElement("span");
        hazardSpan.className = "pin-hazard-label";
        hazardSpan.dataset.hazard = hazardCategory;
        hazardSpan.dataset.visible = isZoomedInForLabels ? "true" : "false";
        hazardSpan.textContent = hazardLabelText;
        button.append(hazardSpan);

        const badge = document.createElement("span");
        badge.className = "pin-context-badge";
        badge.textContent = `${contextLabel} · Sev ${sev}`;
        button.append(badge);

        button.addEventListener("click", () => setSelected(r));
        el.append(button);
        const marker = new maplibregl.Marker(el)
          .setLngLat([r.longitude, r.latitude])
          .addTo(map);
        markersRef.current.push(marker);

        try {
          const controls = animate(
            button,
            { opacity: [0, 1], scale: [0.35, 1.08, 1] },
            {
              duration: 0.36,
              delay: staggerDelay,
              ease: [0.16, 1, 0.3, 1],
            },
          );
          activeAnimations.push(controls);
        } catch {
          button.style.opacity = "1";
          button.style.transform = "scale(1)";
        }
      }
    });

    return () => {
      activeAnimations.forEach((ctrl) => ctrl.stop());
    };
  }, [clusteredNodes, selected?.id, filterAnimationKey, mapZoom]);

  function focusReportOnMap(r: IncidentMapReport) {
    setSelected(r);
    if (mapRef.current && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) {
      mapRef.current.flyTo({
        center: [r.longitude, r.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 13),
        duration: 600,
      });
    }
  }

  // Generate and download a high-resolution PNG of the visible map area and incident overlay
  function handleDownloadMapSnapshot() {
    setSnapshotStatus("rendering");
    const map = mapRef.current;
    const container = containerRef.current;
    const isNight = resolveIsNight(readInitialTheme());

    const rect = container?.getBoundingClientRect();
    const cssW = Math.max(640, Math.round(rect?.width ?? 960));
    const cssH = Math.max(440, Math.round(rect?.height ?? 600));
    const scale = 2; // High-resolution 2x Retina export
    const outW = cssW * scale;
    const outH = cssH * scale;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) {
      setSnapshotStatus("idle");
      return;
    }

    // 1. Fill base cartographic background
    ctx.fillStyle = isNight ? "#0B141A" : "#E9EDE8";
    ctx.fillRect(0, 0, outW, outH);

    // Subtle survey coordinate grid lines
    ctx.strokeStyle = isNight ? "rgba(72, 181, 198, 0.08)" : "rgba(11, 101, 116, 0.08)";
    ctx.lineWidth = 1 * scale;
    const step = 64 * scale;
    for (let gx = step; gx < outW; gx += step) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, outH);
      ctx.stroke();
    }
    for (let gy = step; gy < outH; gy += step) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(outW, gy);
      ctx.stroke();
    }

    // 2. Draw MapLibre WebGL canvas if untainted
    let workingCanvas = exportCanvas;
    let workingCtx = ctx;
    if (map) {
      try {
        const glCanvas = map.getCanvas();
        ctx.drawImage(glCanvas, 0, 0, outW, outH);
        // Verify canvas is not CORS-tainted before drawing overlays
        exportCanvas.toDataURL("image/png");
      } catch {
        // Fallback to clean untainted canvas if external OSM tiles tainted WebGL
        const fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = outW;
        fallbackCanvas.height = outH;
        const fCtx = fallbackCanvas.getContext("2d");
        if (fCtx) {
          fCtx.fillStyle = isNight ? "#0B141A" : "#E9EDE8";
          fCtx.fillRect(0, 0, outW, outH);
          fCtx.strokeStyle = isNight ? "rgba(72, 181, 198, 0.12)" : "rgba(11, 101, 116, 0.12)";
          fCtx.lineWidth = 1 * scale;
          for (let gx = step; gx < outW; gx += step) {
            fCtx.beginPath();
            fCtx.moveTo(gx, 0);
            fCtx.lineTo(gx, outH);
            fCtx.stroke();
          }
          for (let gy = step; gy < outH; gy += step) {
            fCtx.beginPath();
            fCtx.moveTo(0, gy);
            fCtx.lineTo(outW, gy);
            fCtx.stroke();
          }
          workingCanvas = fallbackCanvas;
          workingCtx = fCtx;
        }
      }
    }

    const projectPoint = (lon: number, lat: number) => {
      if (map) {
        return map.project([lon, lat]);
      }
      return { x: cssW / 2, y: cssH / 2 };
    };

    // 3. Draw Heatmap Density Overlay if active
    if (showHeatmap) {
      const hmTemp = document.createElement("canvas");
      hmTemp.width = outW;
      hmTemp.height = outH;
      const hmCtx = hmTemp.getContext("2d");
      if (hmCtx) {
        paintHeatmapOverlay(hmCtx, outW, outH, visibleReports, projectPoint, scale);
        workingCtx.drawImage(hmTemp, 0, 0);
      }
    }

    // 4. Draw all visible Incident Pins & D3 Cluster Markers
    for (const node of clusteredNodes) {
      const pt = projectPoint(node.longitude, node.latitude);
      const px = pt.x * scale;
      const py = pt.y * scale;
      if (px < -40 || py < -40 || px > outW + 40 || py > outH + 40) continue;

      if (node.kind === "cluster") {
        const r = 18 * scale;
        workingCtx.save();
        workingCtx.beginPath();
        workingCtx.arc(px, py, r, 0, Math.PI * 2);
        workingCtx.fillStyle = "#0E6F7D";
        workingCtx.fill();
        workingCtx.lineWidth = 3 * scale;
        workingCtx.strokeStyle = node.pendingCount > 0 ? "#E8A317" : "#FFFFFF";
        workingCtx.stroke();

        workingCtx.fillStyle = "#FFFFFF";
        workingCtx.font = `700 ${13 * scale}px sans-serif`;
        workingCtx.textAlign = "center";
        workingCtx.textBaseline = "middle";
        workingCtx.fillText(String(node.count), px, py);
        workingCtx.restore();
      } else {
        const r = 11 * scale;
        const rep = node.report;
        const st = stateFromReport({ status: rep.status, reviewOutcome: rep.review_outcome });
        const sev = toSeverityLevel(rep.severity);
        const hazardCategory = resolveHazardCategory(rep);
        const hazardLabelText =
          PIN_HAZARD_SHORT_LABEL[hazardCategory] ?? hazardCategory.toUpperCase();

        workingCtx.save();
        workingCtx.beginPath();
        workingCtx.arc(px, py, r, 0, Math.PI * 2);
        workingCtx.fillStyle =
          st === "confirmed" ? "#218358" : st === "corrected" ? "#0B6574" : "#E8A317";
        workingCtx.fill();
        workingCtx.lineWidth = Math.max(1.5, sev) * scale;
        workingCtx.strokeStyle = isNight ? "#EBF1F4" : "#13222C";
        workingCtx.stroke();

        if (mapZoom >= ZOOM_HAZARD_LABEL_THRESHOLD) {
          workingCtx.font = `700 ${10 * scale}px sans-serif`;
          const textW = workingCtx.measureText(hazardLabelText).width;
          const padX = 5 * scale;
          const boxH = 16 * scale;
          const boxX = px + r + 5 * scale;
          const boxY = py - boxH / 2;

          workingCtx.fillStyle = isNight ? "rgba(17, 31, 41, 0.94)" : "rgba(255, 255, 255, 0.94)";
          workingCtx.fillRect(boxX, boxY, textW + padX * 2, boxH);
          workingCtx.strokeStyle = isNight ? "#334E5E" : "#B8C4BA";
          workingCtx.lineWidth = 1 * scale;
          workingCtx.strokeRect(boxX, boxY, textW + padX * 2, boxH);

          workingCtx.fillStyle = isNight ? "#EBF1F4" : "#13222C";
          workingCtx.textAlign = "left";
          workingCtx.textBaseline = "middle";
          workingCtx.fillText(hazardLabelText, boxX + padX, py);
        }
        workingCtx.restore();
      }
    }

    // 5. Stamp Top Tactical Header Banner on Snapshot
    const bannerH = 52 * scale;
    workingCtx.fillStyle = isNight ? "rgba(17, 31, 41, 0.92)" : "rgba(255, 255, 255, 0.92)";
    workingCtx.fillRect(0, 0, outW, bannerH);
    workingCtx.fillStyle = "#0E6F7D";
    workingCtx.fillRect(0, bannerH - 3 * scale, outW, 3 * scale);

    workingCtx.fillStyle = isNight ? "#EBF1F4" : "#13222C";
    workingCtx.font = `700 ${15 * scale}px sans-serif`;
    workingCtx.textAlign = "left";
    workingCtx.textBaseline = "middle";
    workingCtx.fillText(
      `TerraResponse AI · ${eventName || "Incident Map Snapshot"}`,
      18 * scale,
      bannerH / 2,
    );

    const metaText = `${mapCenter.lat.toFixed(4)}° N, ${mapCenter.lon.toFixed(4)}° E  |  ${visibleReports.length} Pins (${confirmedCount} Confirmed, ${pendingCount} Pending)${showHeatmap ? "  |  Heatmap Active" : ""}  |  ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
    workingCtx.fillStyle = isNight ? "#B7C6CF" : "#3A4B57";
    workingCtx.font = `600 ${12 * scale}px sans-serif`;
    workingCtx.textAlign = "right";
    workingCtx.fillText(metaText, outW - 18 * scale, bannerH / 2);

    // 6. Trigger PNG download
    try {
      const dataUrl = workingCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      link.download = `terraresponse-map-snapshot-${stamp}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSnapshotStatus("saved");
      setTimeout(() => setSnapshotStatus("idle"), 2500);
    } catch {
      setSnapshotStatus("idle");
    }
  }

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

  // Compute summary metrics for the right situational rail
  const sortedVisible = useMemo(() => {
    return [...visibleReports].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }, [visibleReports]);

  const topAdvisory = sortedVisible[0] ?? null;
  const confirmedCount = visibleReports.filter((r) => {
    const s = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
    return s === "confirmed" || s === "corrected";
  }).length;
  const pendingCount = visibleReports.length - confirmedCount;
  const confirmedPct =
    visibleReports.length > 0 ? Math.round((confirmedCount / visibleReports.length) * 100) : 0;

  const hasActiveFilters =
    selectedHazards.length > 0 ||
    selectedSeverities.length > 0 ||
    pendingMode !== "all" ||
    scrubberPct < 100 ||
    showHeatmap ||
    searchQuery.trim() !== "";

  return (
    <div className="tactical-map-shell flex flex-col gap-3 sm:gap-4 w-full">
      {/* Top Filter Bar: Search + Hazard Category + Severity Level + Heatmap + View Mode */}
      <MapFilterBar
        reports={liveReports}
        visibleCount={visibleReports.length}
        confirmedCount={confirmedCount}
        selectedHazards={selectedHazards}
        onToggleHazard={handleToggleHazard}
        onResetHazards={() => setSelectedHazards([])}
        selectedSeverities={selectedSeverities}
        onToggleSeverity={handleToggleSeverity}
        onSelectSeverityPreset={setSelectedSeverities}
        pendingMode={pendingMode}
        onChangePendingMode={setPendingMode}
        showHeatmap={showHeatmap}
        onToggleHeatmap={() => setShowHeatmap((prev) => !prev)}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        hasActiveFilters={hasActiveFilters}
        onResetAllFilters={() => {
          handleResetAllFilters();
          setShowHeatmap(false);
        }}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      />

      {/* Main Command Center Grid */}
      <div
        className={cn(
          "w-full grid gap-4 items-start",
          viewMode === "split"
            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_410px]"
            : "grid-cols-1",
        )}
      >
        {/* Map Stage Container */}
        <div className="relative w-full h-[calc(100vh-210px)] min-h-[580px] rounded-2xl overflow-hidden border border-slate-800 bg-[#0B141A] shadow-2xl">
          <div
            className={cn("w-full h-full relative", className)}
            ref={containerRef}
            data-zoomed-labels={mapZoom >= ZOOM_HAZARD_LABEL_THRESHOLD ? "true" : "false"}
          >
            {/* Gradient Density Heatmap Canvas Overlay */}
            <canvas
              ref={heatmapCanvasRef}
              className="map-heatmap-overlay"
              aria-hidden="true"
              style={{ opacity: showHeatmap ? 1 : 0 }}
            />

            {/* Top-left GPS Pill Readout */}
            <div className="tactical-gps-pill num">
              <Compass
                size={13}
                aria-hidden="true"
                style={{ display: "inline", marginRight: 6, verticalAlign: "-2px", color: "var(--tide)" }}
              />
              {mapCenter.lat.toFixed(4)}° N, {mapCenter.lon.toFixed(4)}° E · {visibleReports.length}{" "}
              {visibleReports.length === 1 ? "pin" : "pins"} shown
              {clusteredNodes.length < visibleReports.length
                ? ` (${clusteredNodes.length} markers · D3 clustered)`
                : ""}
              {mapZoom >= ZOOM_HAZARD_LABEL_THRESHOLD ? " · Hazard Labels On" : ""}
              {showHeatmap ? " · Heatmap On" : ""}
            </div>

            {/* Non-intrusive Dismissible Regional Weather & Seismic Alert */}
            <RegionalAlertOverlay
              alert={regionalAlert}
              loading={alertLoading}
              dismissed={alertDismissed}
              onDismiss={() => setAlertDismissed(true)}
              onRefreshRegion={() =>
                void fetchRegionalAlertForCoords(mapCenter.lat, mapCenter.lon, true)
              }
            />

            {/* Floating Tactical Map Controls on Right Edge */}
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 shadow-xl">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowHeatmap((prev) => !prev)}
                title={showHeatmap ? "Disable Heatmap" : "Enable Heatmap"}
                className={cn(
                  "size-9 rounded-xl border-slate-800 backdrop-blur-md transition-all shadow-md",
                  showHeatmap
                    ? "bg-amber-600 text-white border-amber-500 hover:bg-amber-500"
                    : "bg-slate-950/90 text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <Layers className="size-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRecenter}
                title="Re-center map"
                className="size-9 rounded-xl bg-slate-950/90 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white backdrop-blur-md shadow-md"
              >
                <LocateFixed className="size-4 text-teal-400" />
              </Button>

              <div className="flex flex-col bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md shadow-md mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="size-9 text-slate-300 hover:bg-slate-800 hover:text-white rounded-none"
                >
                  <Plus className="size-4" />
                </Button>
                <div className="h-px bg-slate-800" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="size-9 text-slate-300 hover:bg-slate-800 hover:text-white rounded-none"
                >
                  <Minus className="size-4" />
                </Button>
              </div>
            </div>

            <MapLegend showPending={pendingMode === "all"} />

            {/* Selected Incident Inspector Panel (elevated above bottom scrubber) */}
            {panelReport && (
              <IncidentPanel
                report={panelReport}
                canReview={canReview}
                onClose={() => setSelected(null)}
              />
            )}

            {/* Bottom Temporal Progression Scrubber */}
            <TemporalScrubber
              reports={liveReports}
              visibleCount={visibleReports.length}
              scrubberPct={scrubberPct}
              onChangePct={setScrubberPct}
              timeBounds={timeBounds}
              cutoffTimestamp={cutoffTimestamp}
            />
          </div>
        </div>

        {/* Right Situational Rail (Shown in Split View) */}
        {viewMode === "split" && (
          <aside
            className="w-full max-h-[calc(100vh-210px)] overflow-y-auto pr-1 flex flex-col gap-4 no-scrollbar"
            aria-label="Incident analytics and triage list"
          >
            {/* Card 0: Hazard Summary Sidebar with D3 Bar Chart */}
            <HazardSummaryChart
              reports={liveReports}
              selectedHazards={selectedHazards}
              onToggleHazard={handleToggleHazard}
              onResetHazards={() => setSelectedHazards([])}
            />

            {/* Card 1: Top Priority Incident Highlight */}
            <Card className="bg-slate-950/95 dark:bg-[#0B141A]/95 border-slate-800 text-slate-100 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  Top Priority in View
                </span>
                <Badge
                  variant={topAdvisory ? "default" : "secondary"}
                  className={cn(
                    "font-mono font-bold text-[11px] px-2.5 py-0.5 border-0",
                    topAdvisory
                      ? "bg-amber-500/90 text-slate-950 hover:bg-amber-500"
                      : "bg-slate-800 text-slate-400",
                  )}
                >
                  {topAdvisory ? `Priority ${topAdvisory.priority_score ?? "—"}` : "No Pins"}
                </Badge>
              </div>

              {topAdvisory ? (
                <>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                      {topAdvisory.incidentType
                        ? INCIDENT_LABEL[topAdvisory.incidentType] ?? topAdvisory.incidentType
                        : topAdvisory.title || `Report #TR-${topAdvisory.id.slice(0, 6)}`}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {topAdvisory.summary ||
                        topAdvisory.description ||
                        "Click Center on Map to highlight this location or open the report for full details."}
                    </p>
                    <div className="text-[11px] text-teal-300 font-mono mt-1.5 flex items-center gap-1">
                      <Navigation className="size-3 text-teal-400" />
                      <span>
                        {topAdvisory.location_label ||
                          `${topAdvisory.latitude.toFixed(4)}° N, ${topAdvisory.longitude.toFixed(4)}° E`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs border-0"
                      onClick={() => focusReportOnMap(topAdvisory)}
                    >
                      <Navigation className="size-3.5 mr-1.5" />
                      Center on Map
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs"
                    >
                      <Link
                        href={
                          canReview && topAdvisory.status !== "reviewed"
                            ? `/review/${topAdvisory.id}`
                            : `/reports/${topAdvisory.id}`
                        }
                      >
                        Open Report
                        <ArrowUpRight className="size-3.5 ml-1" />
                      </Link>
                    </Button>
                    <ShareReportButton
                      reportId={topAdvisory.id}
                      title={
                        topAdvisory.incidentType
                          ? INCIDENT_LABEL[topAdvisory.incidentType] ?? topAdvisory.incidentType
                          : topAdvisory.title
                      }
                      variant="quiet"
                      size="md"
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">
                  No geo-tagged incidents match the current filter. Try clicking &ldquo;Reset all filters&rdquo; above.
                </p>
              )}
            </Card>

            {/* Card 2: Pinned Reports Pipeline */}
            <Card className="bg-slate-950/95 dark:bg-[#0B141A]/95 border-slate-800 text-slate-100 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Pinned Reports</h3>
                <Badge variant="outline" className="text-xs font-mono text-teal-400 border-slate-800 bg-slate-900">
                  {sortedVisible.length} shown
                </Badge>
              </div>

              {sortedVisible.length === 0 ? (
                <p className="text-xs text-slate-400">No pinned reports in the current filter.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {sortedVisible.slice(0, 8).map((item) => {
                    const sev = toSeverityLevel(item.severity);
                    const state = stateFromReport({
                      status: item.status,
                      reviewOutcome: item.review_outcome,
                    });
                    const label = item.incidentType
                      ? INCIDENT_LABEL[item.incidentType] ?? item.incidentType
                      : item.title || `Report ${item.id.slice(0, 6)}`;
                    const isSelected = selected?.id === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => focusReportOnMap(item)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-xl border text-xs flex flex-col gap-1 transition-all",
                          isSelected
                            ? "border-teal-500 bg-teal-950/40 text-white"
                            : "border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:bg-slate-850",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-[11px] text-teal-400">
                            #TR-{item.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-sm font-mono",
                              sev >= 4
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-800 text-slate-300",
                            )}
                          >
                            Sev {sev} · {state}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-100 truncate">{label}</div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span className="truncate max-w-[180px]">
                            {item.location_label || `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}`}
                          </span>
                          <span className="shrink-0">
                            {item.uploaded_at ? formatRelativeTime(item.uploaded_at) : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Card 3: Verification Summary & Snapshot Export */}
            <Card className="bg-slate-950/95 dark:bg-[#0B141A]/95 border-slate-800 text-slate-100 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Verification Summary</h3>
                <span className="text-xs text-slate-400 truncate max-w-[140px] font-medium">
                  {eventName || "Active Event"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                  <span>Confirmed by Reviewer</span>
                  <strong className="text-teal-400">
                    {confirmedCount} of {visibleReports.length} ({confirmedPct}%)
                  </strong>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${confirmedPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Pending (Hatched): {pendingCount}</span>
                  <span>Active EOC Filter</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadMapSnapshot}
                  disabled={snapshotStatus === "rendering"}
                  data-testid="download-map-snapshot"
                  className="w-full text-xs font-semibold h-8 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  {snapshotStatus === "saved" ? (
                    <>
                      <Check className="size-3.5 mr-1.5 text-emerald-400" />
                      <span>Snapshot Saved (PNG)</span>
                    </>
                  ) : (
                    <>
                      <Download className="size-3.5 mr-1.5" />
                      <span>
                        {snapshotStatus === "rendering"
                          ? "Rendering High-Res PNG…"
                          : "Download Map Snapshot"}
                      </span>
                    </>
                  )}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <Link href="/reports/new">
                      <Upload className="size-3 mr-1" />
                      Upload Photo
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="text-xs h-8 bg-teal-600 hover:bg-teal-500 text-white font-semibold border-0"
                  >
                    <Link href={canReview ? "/review" : "/reports"}>
                      {canReview ? <CheckSquare className="size-3 mr-1" /> : <FileText className="size-3 mr-1" />}
                      {canReview ? "Review Queue" : "All Reports"}
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
