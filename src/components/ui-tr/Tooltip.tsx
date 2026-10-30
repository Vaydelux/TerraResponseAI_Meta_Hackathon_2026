// src/components/ui-tr/Tooltip.tsx
//
// Minimal CSS tooltip (no JS positioning). Wraps a target element
// in a `<span class="ui-tr-tooltip">`; on hover/focus the `.ui-tr-tooltip__tip`
// appears above the target. The tooltip text is `aria-describedby`
// so screen readers can also surface it (triggered by focus).
//
// For the priority breakdown factors — each segment has a tooltip
// showing the factor name + value + derivation. We avoid Radix's
// tooltip here because the priority bar has 5 segments in a row,
// each needing its own tooltip; CSS positioning keeps it light.

"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** Side the tooltip appears on; default `top`. */
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, className, side = "top" }: TooltipProps) {
  const id = useId();
  return (
    <span className={cn("ui-tr-tooltip", className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn("ui-tr-tooltip__tip", `ui-tr-tooltip__tip--${side}`)}
      >
        {content}
      </span>
    </span>
  );
}
