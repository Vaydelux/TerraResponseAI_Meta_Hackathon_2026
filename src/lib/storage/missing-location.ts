// src/lib/storage/missing-location.ts
//
// Safe handling of missing locations. Per the brief:
//   - "safe handling of missing locations"
//   - "Reports with unknown location remain in an Unlocated list/queue
//     and never receive fabricated map coordinates."
//
// Rules enforced here (defense-in-depth — the route handler ALSO
// enforces these server-side, and the DB has a CHECK constraint; this
// module is the application-layer assertion that the inputs follow
// the rule before they reach the DB):
//
//   1. location_source = "unknown"  → latitude, longitude MUST be null.
//   2. location_source = "gps"      → latitude, longitude MUST be set.
//   3. location_source = "manual"   → latitude, longitude MUST be set.
//   4. When the EXIF GPS is missing/null AND the user didn't pin a
//      manual location, the report MUST be stored with
//      location_source = "unknown" and null coords. The UI shows it
//      in the "Unlocated" list/queue (the dashboard's "Unlocated"
//      stat + the reports list with MapPinOff icon). It NEVER appears
//      on the map (the onMap filter excludes unknown + the marker
//      effect skips null coords).
//   5. The server NEVER fabricates coordinates. If EXIF + user input
//      are both missing, the report stays unknown. We do NOT
//      IP-geolocate (unreliable + privacy-invasive); we do NOT
//      guess from the event bbox (would be misleading).
//
// This module is PURE: no side effects, no I/O, fully unit-testable.

export type LocationSource = "gps" | "manual" | "unknown";

export interface LocationInput {
  /** The user's confirmed location source (overrides EXIF when set). */
  userSource: LocationSource | null;
  /** The user's pinned latitude (when userSource = "manual"). */
  userLat: number | null;
  /** The user's pinned longitude (when userSource = "manual"). */
  userLng: number | null;
  /** The EXIF-extracted latitude (may be null). */
  exifLat: number | null;
  /** The EXIF-extracted longitude (may be null). */
  exifLng: number | null;
}

export interface ResolvedLocation {
  source: LocationSource;
  latitude: number | null;
  longitude: number | null;
  /** Human-readable provenance for the audit trail + UI. */
  provenance: string;
  /** True if the EXIF was used as the source (vs. user pin). */
  fromExif: boolean;
}

/**
 * Resolve the final location for a report. Defense-in-depth with the
 * DB CHECK constraint:
 *   location_source = 'unknown' ⇔ (latitude IS NULL AND longitude IS NULL)
 *   location_source in ('gps','manual') ⇔ (latitude IS NOT NULL AND longitude IS NOT NULL)
 *
 * Rules:
 *   - User input takes precedence over EXIF. If the user pinned a
 *     manual location (source = "manual", coords set), use it.
 *   - If the user said "use the EXIF GPS" (source = "gps", coords
 *     null) AND EXIF coords are present, use the EXIF coords with
 *     source = "gps".
 *   - If the user said "use the EXIF GPS" AND EXIF coords are
 *     MISSING, downgrade to source = "unknown" with null coords.
 *     The brief: "If GPS is missing, ask the user to confirm
 *     location manually or mark as unknown."
 *   - If the user explicitly said "I don't know the location"
 *     (source = "unknown"), use source = "unknown" with null coords
 *     REGARDLESS of EXIF. The user's choice wins.
 *
 * Coordinate bounds are validated by the caller (the route handler
 * does this). This module only resolves the source + the coords.
 */
export function resolveLocation(input: LocationInput): ResolvedLocation {
  // User explicitly chose "unknown" → honor it.
  if (input.userSource === "unknown") {
    return {
      source: "unknown",
      latitude: null,
      longitude: null,
      provenance: "user chose unknown location (no coords stored)",
      fromExif: false,
    };
  }
  // User pinned a manual location → use it (with bounds check).
  if (input.userSource === "manual" && input.userLat !== null && input.userLng !== null) {
    return {
      source: "manual",
      latitude: input.userLat,
      longitude: input.userLng,
      provenance: "user-placed pin (manual location confirmation)",
      fromExif: false,
    };
  }
  // User said "use EXIF GPS" (or didn't specify a source — default
  // to EXIF if available, else unknown).
  if (input.exifLat !== null && input.exifLng !== null) {
    return {
      source: "gps",
      latitude: input.exifLat,
      longitude: input.exifLng,
      provenance: "extracted from EXIF GPS data",
      fromExif: true,
    };
  }
  // No EXIF + no user pin → unknown (NEVER fabricate).
  return {
    source: "unknown",
    latitude: null,
    longitude: null,
    provenance:
      "no EXIF GPS + no manual pin → stored as unknown; report appears in the Unlocated list only",
    fromExif: false,
  };
}

/** Validate coordinate bounds. Returns null on success or an error
 *  message on failure. The route handler returns 400 on failure.
 *  Explicitly rejects NaN (NaN comparisons are always false, so
 *  the range check alone would let NaN through). */
export function validateBounds(lat: number | null, lng: number | null): string | null {
  if (lat !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
  }
  if (lng !== null) {
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return "Longitude must be between -180 and 180.";
  }
  return null;
}
