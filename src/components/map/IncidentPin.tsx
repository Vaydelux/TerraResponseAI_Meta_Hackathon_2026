// src/components/map/IncidentPin.tsx
//
// A single incident map pin. The state comes from `stateFromReport`
// (the pin's verification state); the severity from `toSeverityLevel`
// (1–5 ring weight). Size is constant (per the design thesis: pins
// never imply triage — only verification + severity).
//
// This is a server-renderable HTML element used by the IncidentMap
// for <300 incidents (the HTML-marker code path). Clicking calls
// the parent's `onSelect`.
//
// Server-component friendly (it's just a styled button).

import { stateFromReport, type VerificationState } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { cn } from "@/lib/utils";

export interface IncidentPinProps {
  id: string;
  status: string;
  reviewOutcome: string | null;
  severity?: number | null;
  selected?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
}

export function IncidentPin({
  id,
  status,
  reviewOutcome,
  severity,
  selected,
  onSelect,
  className,
}: IncidentPinProps) {
  const state: VerificationState = stateFromReport({ status, reviewOutcome: reviewOutcome });
  const sev = toSeverityLevel(severity);
  return (
    <button
      type="button"
      className={cn("pin", className)}
      data-state={state}
      data-sev={sev}
      data-selected={selected || undefined}
      aria-label={`Incident ${state}, severity ${sev}`}
      onClick={() => onSelect?.(id)}
    />
  );
}
