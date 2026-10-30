// src/components/report/SeverityMeter.tsx
//
// The severity meter (components.css §7.5). Five segments on the
// --sev-* ramp; the numeric value + label are always printed as text
// (per docs/DESIGN.md "never color alone — color-blind users see
// the number too"). Pending severity is hatched on top of the ramp
// so even this number reads as unverified.
//
// Two variants:
//   - compact (used by ReportRow): the bar + the number, no label.
//   - full (used by ObservationPanel): the bar + the value + the label.
//
// The meter carries `data-level` (1..5) + `data-state` (the
// verification state) so the CSS's `.severity[data-state="pending"]
// .severity__seg` rule can apply the hatch overlay.
//
// Server-component friendly.

import { SeverityLevel, SEVERITY_LABELS } from "@/lib/design/severity";
import type { VerificationState } from "@/lib/design/status";
import { cn } from "@/lib/utils";

export interface SeverityMeterProps {
  level: SeverityLevel;
  state: VerificationState;
  compact?: boolean;
  className?: string;
}

export function SeverityMeter({ level, state, compact = false, className }: SeverityMeterProps) {
  return (
    <div
      className={cn("severity", className)}
      data-level={level}
      data-state={state}
      role="meter"
      aria-valuenow={level}
      aria-valuemin={1}
      aria-valuemax={5}
      aria-label={`Severity ${level} of 5 — ${SEVERITY_LABELS[level]}, ${state}`}
    >
      {!compact && (
        <div className="severity__row">
          <span className="severity__value num">{level}</span>
          <span className="t-label">{SEVERITY_LABELS[level]}</span>
        </div>
      )}
      <div className="severity__bar" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="severity__seg" />
        ))}
      </div>
      {compact && (
        <div className="severity__row" style={{ marginTop: 4 }}>
          <span className="t-label num">Sev {level}</span>
          <span className="t-meta">{SEVERITY_LABELS[level]}</span>
        </div>
      )}
    </div>
  );
}
