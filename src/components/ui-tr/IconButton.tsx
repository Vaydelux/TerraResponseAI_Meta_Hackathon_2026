// src/components/ui-tr/IconButton.tsx
//
// Renders `.icon-btn` (40×40 grid square, transparent until hover).
// Used for the theme toggle, zoom controls'Chrome-free icon buttons,
// the user menu trigger, etc. Always include an `aria-label` (the
// button has no visible text).

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the button has no visible text. */
  "aria-label": string;
  children: ReactNode;
}

export function IconButton({ className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cn("icon-btn", className)} {...rest}>
      {children}
    </button>
  );
}
