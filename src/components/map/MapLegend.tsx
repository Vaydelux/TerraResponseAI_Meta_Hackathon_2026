// src/components/map/MapLegend.tsx
//
// The map legend (components.css map.css §7.7). A small floating
// panel at the bottom-left (bottom-right on mobile per the CSS)
// explaining the pin states:
//   - solid green = confirmed by a human
//   - hatched amber = pending review (AI-generated, not verified)
//   - ring weight = severity (1–5)
//   - size = constant (never scaled by priority — pins never imply
//     triage).
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface MapLegendProps {
  className?: string;
  /** When true, the legend includes the "pending" row (the user has
   *  the "show pending" toggle on). */
  showPending?: boolean;
}

export function MapLegend({ className, showPending }: MapLegendProps) {
  return (
    <div className={cn("legend", className)} aria-label="Map legend">
      <div className="legend__row">
        <span
          className="pin"
          aria-hidden="true"
          data-state="confirmed"
          style={{ position: "static", width: 14, height: 14, boxShadow: "none" }}
        />
        <span>Confirmed by a human</span>
      </div>
      {showPending && (
        <div className="legend__row">
          <span
            className="pin"
            aria-hidden="true"
            data-state="pending"
            style={{ position: "static", width: 14, height: 14, boxShadow: "none" }}
          />
          <span>Pending review</span>
        </div>
      )}
      <div className="legend__row">
        <span
          aria-hidden="true"
          style={{ display: "inline-grid", gap: 4, gridAutoFlow: "column", alignItems: "center" }}
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className="pin"
              data-state="confirmed"
              data-sev={s}
              style={{ position: "static", width: 12, height: 12, boxShadow: "none" }}
            />
          ))}
        </span>
        <span>Ring weight = severity (1–5)</span>
      </div>
      <div className="legend__row t-meta">Pin size is constant — never implies triage</div>
    </div>
  );
}
