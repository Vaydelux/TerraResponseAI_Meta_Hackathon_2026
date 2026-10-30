// src/components/seal/HatchSurface.tsx
//
// HatchSurface — a wrapper that applies the hatched top band to any
// region whose state is pending (per docs/DESIGN.md §7.1). On resolve
// the band transitions to a solid state color (green/tide/amber/brick).
//
// Used by ObservationPanel — but ONLY on the top 6px band (the Seal +
// heading + summary), not the full panel, so the text below stays
// readable.
//
// This is a Server Component — no interactivity. The state-driven
// transition is handled by the CSS (`.pending-surface[data-state]`).

import { type VerificationState } from "@/lib/design/status";
import { type ElementType, type ReactNode } from "react";

export interface HatchSurfaceProps {
  state: VerificationState;
  children: ReactNode;
  /** The element type to render. Defaults to "div". */
  as?: ElementType;
  className?: string;
}

export function HatchSurface({
  state,
  children,
  as: Tag = "div",
  className,
}: HatchSurfaceProps) {
  return (
    <Tag className={`pending-surface${className ? ` ${className}` : ""}`} data-state={state}>
      {children}
    </Tag>
  );
}
