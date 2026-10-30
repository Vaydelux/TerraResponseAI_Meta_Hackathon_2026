// src/components/map/ClusterPin.tsx
//
// A cluster marker (used by the GeoJSON layer when ≥300 incidents).
// The CSS `.cluster` is a pill-shaped dark marker with a count.
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface ClusterPinProps {
  count: number;
  /** Clicking a cluster zooms in. */
  onClick?: () => void;
  className?: string;
}

export function ClusterPin({ count, onClick, className }: ClusterPinProps) {
  return (
    <button
      type="button"
      className={cn("cluster", className)}
      aria-label={`${count} incidents at this location — click to zoom in`}
      onClick={onClick}
    >
      {count}
    </button>
  );
}
