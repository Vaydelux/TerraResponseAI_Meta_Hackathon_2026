// src/lib/design/format.ts
//
// Formatting helpers for the TerraResponse AI design system.
//
// Per docs/DESIGN.md §4: "Coordinates display as 14.5995° N, 120.9842° E
// with tabular-nums." Per §10: "same word for the same action everywhere"
// — relative time + absolute time use a consistent vocabulary.

/**
 * Format a latitude/longitude pair as a single human-readable string
 * with cardinal directions + tabular-nums-friendly precision (4
 * decimal places — about 11m at the equator).
 *
 * Example: 14.5995° N, 120.9842° E
 *
 * Returns null if either coordinate is null/undefined (the report
 * has an unknown location).
 */
export function formatCoords(
  lat: number | null | undefined,
  lon: number | null | undefined,
): string | null {
  if (lat == null || lon == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

/**
 * Relative time for recent events ("just now", "5 min ago", "3 hr ago",
 * "2 days ago"), falling back to absolute time for older events.
 *
 * The vocabulary is intentionally narrow — "just now", "min", "hr",
 * "days", then absolute. No "yesterday", no "last week", no fuzzy
 * ranges. The design thesis favors clarity over warmth.
 */
export function formatRelativeTime(iso: string | Date | null | undefined): string {
  if (iso == null) return "";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  // Older than a week — show absolute date.
  return formatAbsoluteTime(date);
}

/**
 * Absolute time as "14:02" (today) or "Mar 14, 14:02" (older). The
 * time is always local — the user's locale determines the exact
 * format. Used by the ProvenanceLine ("Confirmed by Maya R., 14:02")
 * and the audit log table.
 */
export function formatAbsoluteTime(iso: string | Date | null | undefined): string {
  if (iso == null) return "";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return time;
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const day = date.getDate();
  return `${month} ${day}, ${time}`;
}

/**
 * Short ID for the EvidencePurgeDialog's "type the report short ID
 * to confirm" requirement. Takes the first 8 chars of the UUID —
 * enough to be unique within an event, short enough to type.
 */
export function shortReportId(reportId: string): string {
  return reportId.slice(0, 8);
}
