// src/components/ui-tr/Popover.tsx
//
// Minimal popover using a `<details>` element — no JS positioning
// needed. The summary is the trigger; the body is the floating panel.
// Used by the EventSwitcher. The `<details>` element handles focus
// trapping + ESC out of the box; we add a click-outside handler to
// close on outside pointerdown.
//
// CSS lives in globals.css under the `.ui-tr-popover` namespace.

"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PopoverProps {
  /** The clickable trigger. */
  trigger: ReactNode;
  /** The floating body. */
  children: ReactNode;
  /** Accessible label for the disclosure. */
  "aria-label": string;
  /** Side the panel appears on; default `bottom-right`. */
  side?: "bottom-left" | "bottom-right";
  className?: string;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  "aria-label": ariaLabel,
  side = "bottom-right",
  className,
  open: openProp,
  onOpenChange,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const ref = useRef<HTMLDivElement>(null);

  function setOpen(next: boolean) {
    setInternalOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("ui-tr-popover", className)} ref={ref}>
      <button
        type="button"
        className="ui-tr-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`ui-tr-popover__body ui-tr-popover__body--${side}`} role="dialog">
          {children}
        </div>
      )}
    </div>
  );
}
