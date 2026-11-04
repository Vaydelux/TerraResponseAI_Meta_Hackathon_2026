"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinOff, RotateCcw } from "lucide-react";
import { buildSurveyStyle } from "@/components/map/survey-style";
import { readInitialTheme, resolveIsNight } from "@/components/layout/ThemeToggle";
import { validPoint, type LocationPoint } from "@/lib/map/location-search";

export interface LocationMapPickerProps {
  selected: LocationPoint | null;
  onSelect: (coords: LocationPoint) => void;
}

type MapState = "loading" | "ready" | "tiles-unavailable" | "unavailable";

/**
 * This map reflects geographic coordinates, NOT the user's current location
 * or the evidence capture location until the user deliberately selects a point.
 * Coordinates come solely from MapLibre's actual map projection.
 */
export function LocationMapPicker({ selected, onSelect }: LocationMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<MapState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map;
    try {
      // Deliberate overview, never an inferred incident or browser location.
      map = new maplibregl.Map({
        container,
        style: buildSurveyStyle(resolveIsNight(readInitialTheme())),
        center: [121.0, 13.5],
        zoom: 5,
        scrollZoom: false,
        attributionControl: true,
      });
    } catch {
      setStatus("unavailable");
      return;
    }
    mapRef.current = map;
    try {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch {
      setStatus("unavailable");
      try { map.remove(); } catch { /* Partial WebGL init. */ }
      mapRef.current = null;
      return;
    }

    const markerElement = document.createElement("button");
    markerElement.type = "button";
    markerElement.setAttribute("aria-label", "Selected location pin. Use arrow keys to move the pin.");
    markerElement.setAttribute("title", "Drag or use arrow keys to refine the location.");
    markerElement.className = "grid size-11 place-items-center rounded-full border-2 border-[var(--sheet)] bg-[var(--tide)] text-[var(--on-tide)] shadow-lg outline-offset-4 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-tide active:scale-95 motion-reduce:transition-none";
    markerElement.textContent = "+";
    markerElement.style.fontSize = "23px";
    markerElement.style.fontWeight = "700";
    const marker = new maplibregl.Marker({
      element: markerElement,
      draggable: true,
      anchor: "bottom",
    });
    markerRef.current = marker;
    const publish = (point: LocationPoint) => {
      if (!validPoint(point.lat, point.lon)) return;
      onSelectRef.current({
        lat: Number(point.lat.toFixed(6)),
        lon: Number(point.lon.toFixed(6)),
      });
    };
    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      publish({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    };
    const onDragEnd = () => {
      const lngLat = marker.getLngLat();
      publish({ lat: lngLat.lat, lon: lngLat.lng });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = {
        ArrowUp: [1, 0], ArrowDown: [-1, 0],
        ArrowLeft: [0, -1], ArrowRight: [0, 1],
      };
      const delta = directions[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const pos = marker.getLngLat();
      const step = event.shiftKey ? 0.0001 : 0.001;
      const lat = Math.max(-90, Math.min(90, pos.lat + delta[0] * step));
      const lon = Math.max(-180, Math.min(180, pos.lng + delta[1] * step));
      marker.setLngLat([lon, lat]);
      publish({ lat, lon });
    };

    map.on("click", onMapClick);
    marker.on("dragend", onDragEnd);
    markerElement.addEventListener("keydown", onKeyDown);
    const onLoad = () => setStatus((prev) => prev === "tiles-unavailable" ? prev : "ready");
    const onError = () => setStatus("tiles-unavailable");
    const onContextLost = () => setStatus("unavailable");
    const onTheme = () => {
      try { map.setStyle(buildSurveyStyle(resolveIsNight(readInitialTheme()))); }
      catch { setStatus("tiles-unavailable"); }
    };
    map.on("load", onLoad);
    map.on("error", onError);
    const canvas = map.getCanvas();
    canvas.addEventListener("webglcontextlost", onContextLost);
    window.addEventListener("tr-theme-change", onTheme);
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { try { map.resize(); } catch { setStatus("unavailable"); } }) : null;
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      window.removeEventListener("tr-theme-change", onTheme);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      map.off("click", onMapClick);
      map.off("load", onLoad);
      map.off("error", onError);
      marker.off("dragend", onDragEnd);
      markerElement.removeEventListener("keydown", onKeyDown);
      marker.remove();
      markerRef.current = null;
      try { map.remove(); } catch { /* Preserve usable coordinate fields. */ }
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!selected || !validPoint(selected.lat, selected.lon)) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLngLat([selected.lon, selected.lat]).addTo(map);
    const center = map.getCenter();
    const distance = Math.abs(center.lat - selected.lat) + Math.abs(center.lng - selected.lon);
    if (distance > 0.02 || map.getZoom() < 11) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      map.easeTo({ center: [selected.lon, selected.lat], zoom: Math.max(11, map.getZoom()), duration: reduced ? 0 : 240 });
    }
  }, [selected?.lat, selected?.lon, attempt, selected]);

  return <section className="grid min-w-0 gap-2" aria-label="Real interactive location map">
    <div className="relative min-w-0 overflow-hidden rounded-panel border border-rule bg-[var(--sheet-sunk)]">
      <div ref={containerRef} role="region" tabIndex={0} aria-label="MapLibre geographic map. Click to place a pin, drag it to refine, or enter coordinates below."
        data-testid="real-location-map"
        className="h-[320px] min-w-0 w-full sm:h-[400px] lg:h-[440px] [&_.maplibregl-ctrl-group_button]:size-11" />
      {(status === "loading" || status === "unavailable") && <div
        className="absolute inset-0 z-10 grid place-items-center gap-3 bg-[var(--sheet-sunk)]/95 p-4 text-center"
        role="status">
        <MapPinOff className="size-7 text-[var(--ink-3)]" aria-hidden="true" />
        <p className="m-0 max-w-sm text-sm text-[var(--ink-2)]">{status === "loading"
          ? "Loading the real map. You can enter coordinates manually below."
          : "Map unavailable. Coordinate entry and Location unknown are still available."}</p>
        {status === "unavailable" && <button type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl border border-rule bg-sheet px-4 font-semibold text-ink hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)]"
          onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}><RotateCcw size={16} aria-hidden="true"/> Retry map</button>}
      </div>}
    </div>
    <p className="m-0 text-xs leading-relaxed text-[var(--ink-2)]">
      Real geographic map with OpenStreetMap attribution. Its initial view is a Philippines overview—not your detected location. Click the map to place a pin; drag the pin or use its arrow keys to refine. Wheel scrolling stays with the page; use the map zoom controls.
    </p>
    {status === "tiles-unavailable" && <p role="status" className="m-0 rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm">Basemap tiles may be unavailable, but manual coordinates still work. Do not assume the map shows a verified location.</p>}
  </section>;
}
