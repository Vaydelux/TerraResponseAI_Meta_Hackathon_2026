// src/components/ui-tr/Panel.tsx
//
// `.panel` (components.css §7.3): a sheet with a 1px rule border +
// rounded panel radius. Variants: flush (no padding, overflow
// hidden — for cards that contain their own padding), sunk (sheet-
// sunk background — wells + table headers).
//
// Server-component friendly.

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "flush" | "sunk";
  /** Optional header row (title + actions on the right). */
  head?: React.ReactNode;
}

export function Panel({ variant = "default", head, className, children, ...rest }: PanelProps) {
  const cls = cn(
    "panel",
    variant === "flush" && "panel--flush",
    variant === "sunk" && "panel--sunk",
    className,
  );
  return (
    <div className={cls} {...rest}>
      {head && <div className="panel__head">{head}</div>}
      {children}
    </div>
  );
}
