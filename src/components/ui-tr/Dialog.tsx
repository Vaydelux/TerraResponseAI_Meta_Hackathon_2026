// src/components/ui-tr/Dialog.tsx
//
// Dialog built on the native `<dialog>` element (per docs/DESIGN.md
// §11 "Dialogs use the native `<dialog>` element for focus trapping").
// The `.dialog` CSS class lives in components.css §7.9. The dialog
// is uncontrolled: the parent passes `open` + `onClose`. We use
// `HTMLDialogElement.showModal()` for proper modal semantics (ESC
// closes, focus trapped, backdrop inert).
//
// Client component — the dialog API requires imperative calls.

"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional accessible label (or labelledby). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      try {
        el.showModal();
      } catch {
        // already modal
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn("dialog", className)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </dialog>
  );
}

export interface DialogActionsProps {
  children: ReactNode;
  className?: string;
}

export function DialogActions({ children, className }: DialogActionsProps) {
  return <div className={cn("dialog__actions", className)}>{children}</div>;
}
