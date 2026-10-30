// src/lib/design/severity.ts
//
// Severity helpers for the TerraResponse AI design system.
//
// Per docs/DESIGN.md §7.5 "Severity":
//   - Five segments on the --sev-* ramp.
//   - The numeric value + label are always printed as text (never
//     color alone — color-blind users see the number too).
//   - Pending severity is hatched on top of the ramp so even this
//     number reads as unverified.
//
// The model's preliminary_severity is a 1-5 integer (1 = minimal,
// 5 = critical). The labels below match the docs/SECURITY.md
// severity-bands mapping (but capped at 5 levels for the meter).

export type SeverityLevel = 1 | 2 | 3 | 4 | 5;

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  1: "Minimal",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Critical",
};

/**
 * Map a 1-5 severity integer from the AI observation to a SeverityLevel.
 * Values outside 1-5 are clamped to the nearest valid level.
 */
export function toSeverityLevel(value: number | null | undefined): SeverityLevel {
  if (value == null) return 1;
  const v = Math.round(value);
  if (v <= 1) return 1;
  if (v >= 5) return 5;
  return v as SeverityLevel;
}

/**
 * The CSS color-variable name for a severity level. Used by the
 * SeverityMeter component to set the --c custom property on each
 * segment so the ramp renders correctly.
 */
export const SEVERITY_COLOR_VAR: Record<SeverityLevel, string> = {
  1: "--sev-1",
  2: "--sev-2",
  3: "--sev-3",
  4: "--sev-4",
  5: "--sev-5",
};
