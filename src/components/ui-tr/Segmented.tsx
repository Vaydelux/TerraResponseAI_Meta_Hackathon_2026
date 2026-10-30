// src/components/ui-tr/Segmented.tsx
//
// `.segmented` control — a row of mutually-exclusive buttons
// (components.css §7.2). Used by the ThemeToggle (day/night/auto),
// the SeverityMeter compact selector, and the map's "show pending"
// toggle. `aria-pressed` is set on the active button.
//
// Server-component friendly.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional icon to render before the label. */
  icon?: ReactNode;
  /** Optional keyboard hint shown via `.btn__kbd`. */
  kbd?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible label for the group. */
  "aria-label": string;
  className?: string;
  /** Render the buttons full-width (each takes equal share). */
  block?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
  block = false,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn("segmented", block && "segmented--block", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const pressed = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={cn("segmented__btn", block && "segmented__btn--block")}
            aria-pressed={pressed}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.kbd && <kbd className="btn__kbd">{opt.kbd}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
