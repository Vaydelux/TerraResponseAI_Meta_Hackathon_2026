// src/components/upload/LocationConfirm.tsx
//
// Step 2: Confirm Location.
//   - Defaults to "gps" when the photo contains EXIF GPS coordinates,
//     or "manual" ("Place pin manually") when the photo has no EXIF GPS
//     so the user never lands on an unselected blank tab.
//   - Includes an "Auto-locate (Use My Current Location)" button that
//     requests browser geolocation permission (`navigator.geolocation.getCurrentPosition`)
//     with a "Try again" recovery button if permission is denied or times out.
//   - Includes an real geographic MapLibre picker, optional place search, coordinate search
//     and Latitude / Longitude inputs.
//   - Includes an explicit "← Back to photo & details" button so the user
//     can return to Step 1 at any time without losing their upload or form state.

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PlaceSearch } from "@/components/map/PlaceSearch";
import {
  LocateFixed,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Segmented, Field, Input, Button } from "@/components/ui-tr";
import { formatCoords } from "@/lib/design/format";
import { resolveDefaultLocationChoice } from "@/lib/upload/upload-ux-helpers";
import { cn } from "@/lib/utils";

const LocationMapPicker = dynamic(
  () => import("./LocationMapPicker").then((module) => module.LocationMapPicker),
  { ssr: false, loading: () => <div role="status" className="grid min-h-[320px] place-items-center rounded-panel border border-rule bg-[var(--sheet-sunk)] p-4 text-sm text-[var(--ink-2)]">Loading geographic map…</div> },
);

export type LocationChoice = "gps" | "manual" | "unknown";

export interface LocationConfirmProps {
  /** The EXIF-derived coordinates (null if no GPS in the photo). */
  exif: { lat: number; lon: number; capturedAt?: string | null } | null;
  /** Optional previously selected choice when navigating back and forth. */
  initialChoice?: LocationChoice | null;
  /** Optional previously entered manual coordinates when navigating back and forth. */
  initialCoords?: { lat: number; lon: number } | null;
  /** Called whenever the user adjusts location mode or coordinates so non-linear stepper navigation preserves edits. */
  onDraftChange?: (choice: LocationChoice, coords: { lat: number; lon: number } | null) => void;
  /** Called when the user confirms a location and advances to Step 3. */
  onConfirm: (choice: LocationChoice, coords?: { lat: number; lon: number }) => void;
  /** Called when the user clicks Back to return to Step 1. */
  onBack?: () => void;
  className?: string;
}


export function LocationConfirm({
  exif,
  initialChoice,
  initialCoords,
  onDraftChange,
  onConfirm,
  onBack,
  className,
}: LocationConfirmProps) {
  const [choice, setChoice] = useState<LocationChoice>(
    initialChoice ?? resolveDefaultLocationChoice(exif),
  );
  const [manualLat, setManualLat] = useState<string>(
    initialCoords ? String(initialCoords.lat) : exif ? String(exif.lat) : "",
  );
  const [manualLon, setManualLon] = useState<string>(
    initialCoords ? String(initialCoords.lon) : exif ? String(exif.lon) : "",
  );
  const [geoStatus, setGeoStatus] = useState<
    | { kind: "idle" }
    | { kind: "locating" }
    | { kind: "located"; lat: number; lon: number; accuracyMeters?: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function parseValidCoords(latRaw: string, lonRaw: string): { lat: number; lon: number } | null {
    const lat = latRaw.trim() === "" ? null : Number(latRaw);
    const lon = lonRaw.trim() === "" ? null : Number(lonRaw);
    if (
      lat !== null &&
      lon !== null &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      return { lat, lon };
    }
    return null;
  }

  function updateChoiceAndDraft(nextChoice: LocationChoice, nextLat = manualLat, nextLon = manualLon) {
    setChoice(nextChoice);
    if (!onDraftChange) return;
    if (nextChoice === "manual") {
      onDraftChange("manual", parseValidCoords(nextLat, nextLon));
    } else if (nextChoice === "gps" && exif) {
      onDraftChange("gps", { lat: exif.lat, lon: exif.lon });
    } else if (nextChoice === "unknown") {
      onDraftChange("unknown", null);
    }
  }

  function updateManualCoords(nextLat: string, nextLon: string) {
    setManualLat(nextLat);
    setManualLon(nextLon);
    onDraftChange?.("manual", parseValidCoords(nextLat, nextLon));
  }

  const latValue = manualLat.trim() === "" ? null : Number(manualLat);
  const lonValue = manualLon.trim() === "" ? null : Number(manualLon);
  const manualValid =
    latValue !== null &&
    lonValue !== null &&
    Number.isFinite(latValue) &&
    Number.isFinite(lonValue) &&
    latValue >= -90 &&
    latValue <= 90 &&
    lonValue >= -180 &&
    lonValue <= 180;

  function requestBrowserGeolocation() {
    updateChoiceAndDraft("manual");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus({
        kind: "error",
        message:
          "Browser geolocation is not available in this environment. You can try again, click the geographic map, or enter coordinates below.",
      });
      return;
    }

    setGeoStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        setChoice("manual");
        updateManualCoords(String(lat), String(lon));
        setGeoStatus({
          kind: "located",
          lat,
          lon,
          accuracyMeters: Number.isFinite(pos.coords.accuracy)
            ? Math.round(pos.coords.accuracy)
            : undefined,
        });
      },
      (err) => {
        let reason =
          "Could not get your current device location. Please check browser location permissions and try again, or place the pin manually below.";
        if (err.code === 1) {
          reason =
            "Location permission was denied. Please allow location access in your browser and click Try again, or place the pin manually below.";
        } else if (err.code === 3) {
          reason =
            "Location request timed out. Click Try again or place the pin manually below.";
        }
        setGeoStatus({ kind: "error", message: reason });
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 30000,
      },
    );
  }

  function confirm() {
    if (choice === "manual") {
      if (!manualValid || latValue === null || lonValue === null) return;
      onConfirm("manual", { lat: latValue, lon: lonValue });
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
    (choice === "manual" && manualValid);

  return (
    <div className={cn("panel", className)} style={{ display: "grid", gap: "var(--s-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>Confirm the location</h3>
          {exif ? (
            <p className="t-meta" style={{ marginTop: 4 }}>
              GPS from the photo EXIF:{" "}
              <span className="num" style={{ fontWeight: 700, color: "var(--ink)" }}>
                {formatCoords(exif.lat, exif.lon)}
              </span>
              {exif.capturedAt && (
                <> · captured {new Date(exif.capturedAt).toLocaleString()}</>
              )}
            </p>
          ) : (
            <p className="t-meta" style={{ marginTop: 4 }}>
              This photo has no embedded EXIF GPS data.{" "}
              <strong>Place pin manually</strong> is selected by default—or click{" "}
              <strong>Auto-Locate (Use My Location)</strong> to ask browser permission for your
              current coordinates.
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={requestBrowserGeolocation}
          disabled={geoStatus.kind === "locating"}
          data-testid="auto-locate-gps-btn"
        >
          <LocateFixed size={15} aria-hidden="true" />
          <span>
            {geoStatus.kind === "locating"
              ? "Requesting GPS permission…"
              : "Auto-Locate (Use My Location)"}
          </span>
        </button>
      </div>

      {/* Geolocation Permission & Retry Status Banner */}
      {geoStatus.kind === "located" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-ctl)",
            background: "var(--green-wash)",
            border: "1px solid var(--green)",
            color: "var(--green-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span className="t-meta num" style={{ color: "var(--green-ink)", fontWeight: 600 }}>
              Device GPS locked: {formatCoords(geoStatus.lat, geoStatus.lon)}
              {geoStatus.accuracyMeters ? ` (±${geoStatus.accuracyMeters}m)` : ""}
            </span>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={requestBrowserGeolocation}
          >
            <RefreshCw size={13} aria-hidden="true" />
            Refresh GPS
          </button>
        </div>
      )}

      {geoStatus.kind === "error" && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-ctl)",
            background: "var(--amber-wash)",
            border: "1px dashed var(--amber)",
            color: "var(--amber-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span className="t-meta" style={{ color: "var(--amber-ink)", fontWeight: 600 }}>
              {geoStatus.message}
            </span>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={requestBrowserGeolocation}
            data-testid="retry-auto-locate-btn"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: "var(--s-3)" }}>
        <Segmented<LocationChoice>
          aria-label="Location choice"
          block
          options={options}
          value={choice}
          onChange={(v) => updateChoiceAndDraft(v)}
        />

        {choice === "manual" && (
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            <div className="grid min-w-0 gap-2">
              <p className="m-0 text-sm leading-relaxed text-[var(--ink-2)]">Select an actual geographic point on the map, search a place, or enter verified coordinates. A map result is not evidence that a disaster happened there.</p>
              <PlaceSearch label="Find a place or enter latitude, longitude"
                onSelect={(place) => {
                  setChoice("manual");
                  updateManualCoords(String(place.lat), String(place.lon));
                }} />
            </div>
            <LocationMapPicker
              selected={manualValid && latValue !== null && lonValue !== null ? { lat: latValue, lon: lonValue } : null}
              onSelect={(point) => {
                setChoice("manual");
                updateManualCoords(String(point.lat), String(point.lon));
              }}
            />
            <p className="m-0 rounded-ctl border border-rule bg-[var(--sheet-sunk)] p-3 text-xs leading-relaxed text-[var(--ink-2)]">
              The coordinates below are a proposed report location, not the browser GPS position unless you explicitly used Auto-Locate. Verify the point before submitting evidence.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                gap: "var(--s-3)",
              }}
            >
              <Field label="Latitude" htmlFor="lc-lat">
                <Input
                  id="lc-lat"
                  name="latitude"
                  autoComplete="off"
                  spellCheck={false}
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  value={manualLat}
                  onChange={(e) => updateManualCoords(e.target.value, manualLon)}
                  placeholder="14.5995"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Longitude" htmlFor="lc-lon">
                <Input
                  id="lc-lon"
                  name="longitude"
                  autoComplete="off"
                  spellCheck={false}
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  value={manualLon}
                  onChange={(e) => updateManualCoords(manualLat, e.target.value)}
                  placeholder="120.9842"
                  inputMode="decimal"
                />
              </Field>
            </div>
          </div>
        )}

        {choice === "manual" && !manualValid && (
          <p role="status" className="t-meta">
            Enter both coordinates (latitude −90 to 90, longitude −180 to 180), search for a place, click the real map, or use <strong>Auto-Locate</strong>.
          </p>
        )}
      </div>

      <div
        style={{
          marginTop: "var(--s-2)",
          paddingTop: "var(--s-3)",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--s-2)",
          flexWrap: "wrap",
        }}
      >
        {onBack ? (
          <Button variant="quiet" onClick={onBack} data-testid="step2-back-btn">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to photo &amp; details</span>
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={confirm} disabled={!ready}>
          {choice === "unknown" ? "Mark as unknown" : "Use this location"}
        </Button>
      </div>
    </div>
  );
}
