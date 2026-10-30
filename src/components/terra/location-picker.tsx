"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LocationPickerProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onChange: (lat: number | null, lng: number | null) => void;
  exifLat?: number | null;
  exifLng?: number | null;
}

const DEFAULT_CENTER: [number, number] = [-98.5, 39.8];
const DEFAULT_ZOOM = 3;

export function LocationPicker({
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  onChange,
  exifLat,
  exifLng,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    exifLat !== null && exifLat !== undefined && exifLng !== null && exifLng !== undefined
      ? { lat: exifLat, lng: exifLng }
      : null,
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          { id: "osm-tiles", type: "raster", source: "osm" },
        ],
      },
      center: coords ? [coords.lng, coords.lat] : initialCenter,
      zoom: coords ? 14 : initialZoom,
    });
    mapRef.current = map;

    // placeMarker is defined INSIDE the effect so it captures `map`.
    function placeMarker(lat: number, lng: number) {
      if (markerRef.current) markerRef.current.remove();
      const marker = new Marker({ draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        setCoords({ lat: ll.lat, lng: ll.lng });
        onChange(ll.lat, ll.lng);
      });
      markerRef.current = marker;
      setCoords({ lat, lng });
      onChange(lat, lng);
    }

    map.on("click", (e) => {
      placeMarker(e.lngLat.lat, e.lngLat.lng);
    });

    if (coords) {
      map.on("load", () => {
        placeMarker(coords.lat, coords.lng);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  function handleManualInput(field: "lat" | "lng", value: string) {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    const newCoords = field === "lat"
      ? { lat: num, lng: coords?.lng ?? 0 }
      : { lat: coords?.lat ?? 0, lng: num };
    setCoords(newCoords);
    onChange(newCoords.lat, newCoords.lng);
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLngLat([newCoords.lng, newCoords.lat]);
      mapRef.current.flyTo({ center: [newCoords.lng, newCoords.lat], zoom: 14 });
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[300px] w-full rounded-lg border"
        aria-label="Map pin picker — click to place, drag to move"
      />
      {coords && (
        <div className="flex items-center gap-3 text-sm">
          <Label htmlFor="lat-input" className="text-xs">Lat</Label>
          <Input
            id="lat-input"
            type="number"
            step="0.0001"
            min={-90}
            max={90}
            value={coords.lat}
            onChange={(e) => handleManualInput("lat", e.target.value)}
            className="h-8 w-28"
          />
          <Label htmlFor="lng-input" className="text-xs">Lng</Label>
          <Input
            id="lng-input"
            type="number"
            step="0.0001"
            min={-180}
            max={180}
            value={coords.lng}
            onChange={(e) => handleManualInput("lng", e.target.value)}
            className="h-8 w-28"
          />
        </div>
      )}
      {!coords && (
        <p className="text-xs text-muted-foreground">
          Click the map to place a pin, or enter coordinates manually.
        </p>
      )}
    </div>
  );
}
