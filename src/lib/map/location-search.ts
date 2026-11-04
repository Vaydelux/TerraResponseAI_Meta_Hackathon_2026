/** WGS84 coordinates used for both manual pinning and address search. */
export interface LocationPoint { lat: number; lon: number }
export interface PlaceSearchResult extends LocationPoint {
  id: string;
  label: string;
  source: "coordinates" | "maptiler";
}

export function validPoint(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * A deliberate coordinate query works locally with no account, key or network.
 * Do not guess location from arbitrary natural-language strings.
 */
export function parseCoordinateQuery(query: string): LocationPoint | null {
  const normalized = query.trim();
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[,;]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (!match) return null;
  const lat = Number(match[1]), lon = Number(match[2]);
  return validPoint(lat, lon) ? { lat, lon } : null;
}

export function formatLocationPoint(point: LocationPoint): string {
  return point.lat.toFixed(5) + ", " + point.lon.toFixed(5);
}
