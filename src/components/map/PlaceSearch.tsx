"use client";

import { useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { formatLocationPoint, parseCoordinateQuery, type PlaceSearchResult } from "@/lib/map/location-search";

interface PlaceSearchProps {
  onSelect: (place: PlaceSearchResult) => void;
  label?: string;
}

type SearchState =
  | { query: string; kind: "loading" }
  | { query: string; kind: "done"; places: PlaceSearchResult[] }
  | { query: string; kind: "error"; message: string };

const actionClass = "inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-ctl border border-rule bg-sheet px-3 py-2 text-left text-sm text-ink transition-colors hover:border-[var(--tide)] hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none";

/**
 * Report search is separate: these are ordinary geography results and must
 * never be used as evidence for the existence of a disaster.
 */
export function PlaceSearch({ onSelect, label = "Search places or coordinates" }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchState | null>(null);
  const normalized = query.trim();
  const coords = parseCoordinateQuery(normalized);
  const invalidCoords = !coords && /^[+-]?[\d.]+\s*[,;]\s*[+-]?[\d.]+\s*$/.test(normalized);
  const canSearchName = normalized.length >= 3 && !coords && !invalidCoords;

  useEffect(() => {
    if (!canSearchName) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemote({ kind: "loading", query: normalized });
      try {
        const response = await fetch("/api/map/geocode", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: normalized }),
        });
        const result: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && result && typeof result === "object" &&
          Array.isArray((result as { places?: unknown }).places)) {
          const places = (result as { places: PlaceSearchResult[] }).places;
          setRemote({ kind: "done", query: normalized, places });
        } else {
          const error = result && typeof result === "object"
            ? (result as { error?: { message?: unknown } }).error?.message : null;
          setRemote({ kind: "error", query: normalized, message: typeof error === "string"
            ? error : "Place search is currently unavailable. Enter coordinates or use the map." });
        }
      } catch {
        if (!controller.signal.aborted) setRemote({
          kind: "error", query: normalized,
          message: "Place search is unavailable. Map pinning and coordinate entry still work.",
        });
      }
    }, 550);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canSearchName, normalized]);

  const matched = remote?.query === normalized ? remote : null;

  return <section aria-label="Search geographic places, separate from incident reports" className="grid min-w-0 gap-2">
    <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">
      {label}
      <span className="flex min-w-0 items-center gap-2 rounded-ctl border border-[var(--rule-strong)] bg-sheet px-3 focus-within:ring-2 focus-within:ring-tide">
        <Search size={17} aria-hidden="true" className="shrink-0 text-[var(--ink-3)]" />
        <input type="search" data-testid="location-place-search" autoComplete="off" maxLength={100}
          value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Place name or 14.5995, 120.9842"
          className="min-h-11 min-w-0 flex-1 bg-transparent py-2 font-normal text-ink outline-none placeholder:text-[var(--ink-3)]" />
      </span>
    </label>
    <p className="m-0 text-xs leading-relaxed text-[var(--ink-3)]">Coordinates are processed locally. Place-name queries use the optional MapTiler search service; no photos or incident descriptions are sent. Search results are locations, not confirmed incidents.</p>
    {coords && <button type="button" className={actionClass}
      onClick={() => onSelect({ id: "coordinates", label: formatLocationPoint(coords), ...coords, source: "coordinates" })}>
      <MapPin className="size-4 shrink-0 text-tide" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">Locate coordinates: {formatLocationPoint(coords)}</span>
    </button>}
    {invalidCoords && <p role="status" className="m-0 text-sm text-[var(--amber-ink)]">Coordinates outside valid ranges. Latitude −90 to 90; longitude −180 to 180.</p>}
    {canSearchName && matched?.kind === "loading" && <p role="status" className="m-0 text-sm text-[var(--ink-2)]">Searching places…</p>}
    {canSearchName && matched?.kind === "error" && <p role="status" className="m-0 rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm text-[var(--amber-ink)]">{matched.message}</p>}
    {canSearchName && matched?.kind === "done" && <div className="grid min-w-0 gap-1" role="group" aria-label="Place search results">
      {matched.places.length === 0 && <p role="status" className="m-0 text-sm text-[var(--ink-2)]">No matching places. You can enter coordinates or tap the map.</p>}
      {matched.places.map((place, index) => <button key={place.id + index} type="button" className={actionClass}
        onClick={() => onSelect(place)}>
        <MapPin className="size-4 shrink-0 text-tide" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{place.label}</span>
        <span className="sr-only">{formatLocationPoint(place)}</span>
      </button>)}
      {matched.places.length > 0 && <p className="m-0 text-xs text-[var(--ink-3)]">Search © MapTiler · selecting a place moves the map; it does not submit or verify an incident.</p>}
    </div>}
  </section>;
}
