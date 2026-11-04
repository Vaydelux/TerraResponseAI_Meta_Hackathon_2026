"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MapPinOff, RotateCcw } from "lucide-react";
import { buildSurveyStyle } from "./survey-style";
import { clusterIncidentsWithD3 } from "./d3Cluster";
import { readInitialTheme, resolveIsNight } from "@/components/layout/ThemeToggle";
import { stateFromReport } from "@/lib/design/status";
import { hasMapLocation, reportTitle, type WorkspaceReport } from "@/lib/workspace/incidents";
import type { IncidentMapReport } from "./IncidentMap";
import { workspaceAction as actionClass, workspaceMapHeight as viewportClass } from "@/lib/workspace/presentation";

export interface GeoCanvasProps {
  reports: WorkspaceReport[];
  selectedId: string | null;
  onSelectReport: (id: string) => void;
}

/** A controlled, read-only canvas. Panning never changes the workspace's data window. */
export function GeoCanvas({ reports, selectedId, onSelectReport }: GeoCanvasProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Array<{ marker: maplibregl.Marker; id: string | null }>>([]);
  const focusedMarkerRef = useRef<string | null>(null);
  const selectionRef = useRef(onSelectReport);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(11);
  const [status, setStatus] = useState<"loading" | "ready" | "tiles-unavailable" | "unavailable">("loading");

  useEffect(() => { selectionRef.current = onSelectReport; }, [onSelectReport]);
  const located = useMemo<Array<WorkspaceReport & IncidentMapReport>>(() => reports.filter(hasMapLocation).map((report) => ({
    ...report,
    latitude: report.latitude as number,
    longitude: report.longitude as number,
    priority_score: report.priority_score ?? null,
    severity: report.severity ?? undefined,
    incidentType: report.incident_type,
  })), [reports]);
  const locatedRef = useRef(located);
  useEffect(() => { locatedRef.current = located; }, [located]);

  const fitReports = useCallback(() => {
    const map = mapRef.current;
    const points = locatedRef.current;
    if (!map || !points.length) return;
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  }, []);

  // MapLibre is owned by React's ref-attach/cleanup lifecycle.
  // A failed WebGL constructor updates failure state in the commit callback,
  // rather than issuing a synchronous state update inside an effect.
  const attachMap = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    let map: maplibregl.Map;
    let disposed = false;
    try {
      map = new maplibregl.Map({
        container,
        style: buildSurveyStyle(resolveIsNight(readInitialTheme())),
        // Default camera is never used as a report location.
        center: locatedRef.current[0]
          ? [locatedRef.current[0].longitude, locatedRef.current[0].latitude]
          : [121, 14.6],
        zoom: 11,
        scrollZoom: false,
        attributionControl: {},
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      fitReports();
    } catch {
      try { mapRef.current?.remove(); } catch { /* WebGL constructor may have partially failed. */ }
      mapRef.current = null;
      setStatus("unavailable");
      return;
    }

    const onLoad = () => {
      if (!disposed) setStatus((current) => current === "tiles-unavailable" ? current : "ready");
    };
    const onError = () => { if (!disposed) setStatus("tiles-unavailable"); };
    const onContextLost = () => { if (!disposed) setStatus("unavailable"); };
    const onMove = () => { if (!disposed) setZoom(map.getZoom()); };
    const onTheme = () => {
      try { map.setStyle(buildSurveyStyle(resolveIsNight(readInitialTheme()))); }
      catch { onError(); }
    };
    const resize = () => {
      if (disposed) return;
      try { map.resize(); } catch { onError(); }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(container);
    window.addEventListener("resize", resize);
    const canvas = map.getCanvas();
    canvas.addEventListener("webglcontextlost", onContextLost);
    map.on("load", onLoad);
    map.on("error", onError);
    map.on("moveend", onMove);
    window.addEventListener("tr-theme-change", onTheme);
    const slowLoad = setTimeout(() => {
      if (!disposed) setStatus((current) => current === "loading" ? "tiles-unavailable" : current);
    }, 12000);

    // React 19 ref cleanup runs on unmount and whenever retry changes identity.
    return () => {
      disposed = true;
      clearTimeout(slowLoad);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("tr-theme-change", onTheme);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
      try { map.remove(); } catch { /* Do not crash the report queue. */ }
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [attempt, fitReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];
    clusterIncidentsWithD3(located, zoom).forEach((node) => {
      const button = document.createElement("button");
      button.type = "button";
      const confirmed = node.kind === "single" && stateFromReport({ status: node.report.status, reviewOutcome: node.report.review_outcome }) === "confirmed";
      button.className = `grid size-11 place-items-center rounded-full border-2 font-mono text-sm font-bold shadow-md transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tide active:scale-95 ${confirmed ? "border-[var(--green-ink)] bg-[var(--green-wash)] text-[var(--green-ink)]" : "border-[var(--amber-ink)] bg-[var(--amber-wash)] text-[var(--amber-ink)]"}`;
      if (node.kind === "cluster") {
        button.textContent = String(node.count);
        button.setAttribute("aria-label", `Zoom into cluster of ${node.count} reports`);
        button.addEventListener("click", () => map.easeTo({ center: [node.longitude, node.latitude], zoom: Math.min(16, map.getZoom() + 2), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 }));
      } else {
        button.textContent = confirmed ? "✓" : "?";
        button.setAttribute("aria-label", `Select ${reportTitle(node.report)}; ${confirmed ? "human confirmed" : "not verified"}`);
        button.dataset.reportId = node.report.id;
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => selectionRef.current(node.report.id));
      }
      const marker = new maplibregl.Marker({ element: button }).setLngLat([node.longitude, node.latitude]).addTo(map);
      markersRef.current.push({ marker, id: node.kind === "single" ? node.report.id : null });
    });
    if (focusedMarkerRef.current) markersRef.current.find(({ id }) => id === focusedMarkerRef.current)?.marker.getElement().focus({ preventScroll: true });
    return () => {
      focusedMarkerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.reportId ?? null : null;
      markersRef.current.forEach(({ marker }) => marker.remove()); markersRef.current = [];
    };
  }, [located, zoom, attempt]);

  useEffect(() => {
    markersRef.current.forEach(({ marker, id }) => {
      if (!id) return;
      const element = marker.getElement();
      element.setAttribute("aria-pressed", String(id === selectedId));
      element.classList.toggle("ring-4", id === selectedId);
      element.classList.toggle("ring-[var(--tide)]", id === selectedId);
    });
  }, [selectedId, located, zoom, attempt]);

  useEffect(() => {
    const report = located.find((entry) => entry.id === selectedId);
    if (!report || !mapRef.current) return;
    mapRef.current.easeTo({ center: [report.longitude, report.latitude], zoom: Math.max(15, mapRef.current.getZoom()), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  }, [selectedId, located]);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 overflow-hidden rounded-panel border border-rule bg-[var(--sheet-sunk)] [grid-template-areas:'map'] [&_.maplibregl-ctrl-group_button]:size-11 [&_.maplibregl-ctrl-attrib]:max-w-full [&_.maplibregl-ctrl-attrib]:text-[10px]">
        <div ref={attachMap} className={`${viewportClass} min-w-0 w-full [grid-area:map]`} role="region" aria-label="Incident map. Select a pin or use the priority queue below." data-testid="workspace-map" />
        {(status === "unavailable" || status === "loading") && (
          <div className={`${viewportClass} z-10 flex flex-col items-center justify-center gap-3 bg-[var(--sheet-sunk)] px-6 text-center [grid-area:map]`} role="status">
            <MapPinOff className="size-8 text-[var(--ink-3)]" aria-hidden="true" />
            <strong>{status === "loading" ? "Preparing incident map…" : "Interactive map unavailable"}</strong>
            <p className="max-w-sm text-sm text-[var(--ink-2)]">{status === "loading" ? "The report queue is ready to use while the map loads." : "Your browser could not start the map. Use the queue, timeline, and report details below."}</p>
            {status === "unavailable" && <button type="button" className={actionClass} onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>Retry map</button>}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--ink-2)]" role="status">
          {status === "tiles-unavailable" ? "Basemap tiles unavailable. Report pins and the queue remain usable." : status === "unavailable" ? "Map unavailable; report data is unchanged." : `${located.length} located reports · ? pending · ✓ human confirmed · numbers group nearby reports`}
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {status === "tiles-unavailable" && <button type="button" className={actionClass} onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" />Retry tiles</button>}
          <button type="button" className={actionClass} onClick={fitReports} disabled={!located.length || status === "unavailable"}><LocateFixed size={16} aria-hidden="true" />Fit reports</button>
        </div>
      </div>
    </div>
  );
}
