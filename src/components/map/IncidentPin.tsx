"use client";

// src/components/map/IncidentPin.tsx
//
// A single incident map pin with Framer Motion staggered scale-in
// entrance animation when filters are toggled or the temporal
// scrubber is moved.

import { motion } from "framer-motion";
import { stateFromReport, type VerificationState } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { cn } from "@/lib/utils";

export const PIN_HAZARD_SHORT_LABEL: Record<string, string> = {
  flooding: "FLOOD",
  fire: "FIRE",
  medical: "MEDICAL",
  visible_structural_damage: "STRUCTURAL",
  blocked_road: "ROAD BLOCKED",
  debris: "DEBRIS",
  other: "HAZARD",
  unclear: "HAZARD",
};

export interface IncidentPinProps {
  id: string;
  status: string;
  reviewOutcome: string | null;
  severity?: number | null;
  hazardType?: string | null;
  showHazardLabel?: boolean;
  selected?: boolean;
  /** Optional 0-based index for staggered entrance animation. */
  index?: number;
  onSelect?: (id: string) => void;
  className?: string;
}

export function IncidentPin({
  id,
  status,
  reviewOutcome,
  severity,
  hazardType,
  showHazardLabel = false,
  selected,
  index = 0,
  onSelect,
  className,
}: IncidentPinProps) {
  const state: VerificationState = stateFromReport({ status, reviewOutcome });
  const sev = toSeverityLevel(severity);
  const hazardKey = hazardType || "other";
  const hazardLabel = PIN_HAZARD_SHORT_LABEL[hazardKey] ?? hazardKey.toUpperCase();

  return (
    <motion.button
      type="button"
      className={cn("pin", className)}
      data-state={state}
      data-sev={sev}
      data-hazard={hazardKey}
      data-selected={selected || undefined}
      aria-label={`Incident ${state}, severity ${sev}${hazardType ? `, ${hazardLabel}` : ""}`}
      onClick={() => onSelect?.(id)}
      initial={{ opacity: 0, scale: 0.35 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{
        type: "spring",
        stiffness: 360,
        damping: 24,
        delay: Math.min(index * 0.035, 0.45),
      }}
    >
      {showHazardLabel && hazardType && (
        <span className="pin-hazard-label" data-hazard={hazardKey}>
          {hazardLabel}
        </span>
      )}
    </motion.button>
  );
}
