// src/components/upload/LocationConfirm.tsx
//
// Shows the EXIF coordinates on a small map with a draggable pin +
// an explicit "Use this location" confirmation. If no GPS, asks the
// contributor to place the pin (manual). The user may also choose
// "Location unknown".
//
// For simplicity in this hackathon build, we render a static
// placeholder map (no MapLibre here — that'd duplicate the IncidentMap's
// 90KB). The contributor sees the EXIF coords as text + a "Use this
// location" / "Place manually" / "Location unknown" segmented
// choice. Manual placement uses two number inputs for lat/lon.
//
// Per the brief: "If valid GPS exists, display the point and require
// user confirmation. Otherwise offer a manual pin picker. The user
// may choose 'Location unknown'."
//
// Client component — manages the three-way choice state.

"use client";

import { useState } from "react";
import { Segmented, Field, Input, Button } from "@/components/ui-tr";
import { formatCoords } from "@/lib/design/format";
import { cn } from "@/lib/utils";

export type LocationChoice = "gps" | "manual" | "unknown";

export interface LocationConfirmProps {
  /** The EXIF-derived coordinates (null if no GPS in the photo). */
  exif: { lat: number; lon: number; capturedAt?: string | null } | null;
  /** Called when the user confirms a location. */
  onConfirm: (choice: LocationChoice, coords?: { lat: number; lon: number }) => void;
  className?: string;
}

export function LocationConfirm({ exif, onConfirm, className }: LocationConfirmProps) {
  const [choice, setChoice] = useState<LocationChoice | null>(exif ? "gps" : null);
  const [manualLat, setManualLat] = useState<string>("");
  const [manualLon, setManualLon] = useState<string>("");

  function confirm() {
    if (choice === "manual") {
      const lat = Number(manualLat);
      const lon = Number(manualLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return;
      }
      onConfirm("manual", { lat, lon });
    } else if (choice === "gps" && exif) {
      onConfirm("gps", { lat: exif.lat, lon: exif.lon });
    } else if (choice === "unknown") {
      onConfirm("unknown");
    }
  }

  const options: Array<{ value: LocationChoice; label: string }> = [];
  if (exif) options.push({ value: "gps", label: "Use GPS from photo" });
  options.push({ value: "manual", label: "Place pin manually" });
  options.push({ value: "unknown", label: "Location unknown" });

  const ready =
    choice === "unknown" ||
    (choice === "gps" && !!exif) ||
    (choice === "manual" && Number.isFinite(Number(manualLat)) && Number.isFinite(Number(manualLon)));

  return (
    <div className={cn("panel", className)}>
      <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-3)" }}>Confirm the location</h3>
      {exif && (
        <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
          GPS from the photo EXIF: <span className="num">{formatCoords(exif.lat, exif.lon)}</span>
          {exif.capturedAt && <> · captured {new Date(exif.capturedAt).toLocaleString()}</>}
        </p>
      )}
      {!exif && (
        <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
          The photo has no GPS data. Place the pin manually, or mark the location as unknown.
        </p>
      )}
      <div style={{ display: "grid", gap: "var(--s-3)" }}>
        <Segmented<LocationChoice>
          aria-label="Location choice"
          block
          options={options}
          value={choice ?? "unknown"}
          onChange={(v) => setChoice(v)}
        />
        {choice === "manual" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
            <Field label="Latitude" htmlFor="lc-lat">
              <Input
                id="lc-lat"
                type="number"
                step="0.0001"
                min="-90"
                max="90"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="14.5995"
                inputMode="decimal"
              />
            </Field>
            <Field label="Longitude" htmlFor="lc-lon">
              <Input
                id="lc-lon"
                type="number"
                step="0.0001"
                min="-180"
                max="180"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                placeholder="120.9842"
                inputMode="decimal"
              />
            </Field>
          </div>
        )}
      </div>
      <div style={{ marginTop: "var(--s-4)", display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
        <Button variant="primary" onClick={confirm} disabled={!ready}>
          {choice === "unknown" ? "Mark as unknown" : "Use this location"}
        </Button>
      </div>
    </div>
  );
}
