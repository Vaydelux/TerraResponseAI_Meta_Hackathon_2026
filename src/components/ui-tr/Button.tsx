// src/components/ui-tr/Button.tsx
//
// Thin wrapper around the `.btn` CSS classes (components.css §7.2).
// Variants map to the seal-state-agnostic button modifiers:
//   - default  → .btn
//   - primary  → .btn--primary (tide action color)
//   - danger   → .btn--danger (brick outline — destructive actions)
//   - quiet    → .btn--quiet (borderless, used in dense rows)
// Sizes: lg (52px) and block (100% width). `aria-busy="true"` shows
// the spinner via the CSS pseudo-element.
//
// Server-component friendly (no 'use client'). Renders an `<a>` if
// `href` is provided, a `<button>` otherwise.

import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "primary" | "danger" | "quiet";
export type ButtonSize = "default" | "lg";

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to fill the parent. */
  block?: boolean;
  /** Shows the spinner + disables pointer events. */
  busy?: boolean;
  /** Optional keyboard hint shown as `.btn__kbd`. */
  kbd?: string;
  /** Render as a link instead of a button. */
  href?: string;
  children: ReactNode;
};

type ButtonAsButton = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "",
  primary: "btn--primary",
  danger: "btn--danger",
  quiet: "btn--quiet",
};

export function Button(props: ButtonProps) {
  const {
    variant = "default",
    size = "default",
    block = false,
    busy = false,
    kbd,
    href,
    children,
    className,
    ...rest
  } = props;

  const cls = cn(
    "btn",
    VARIANT_CLASS[variant],
    size === "lg" && "btn--lg",
    block && "btn--block",
    className,
  );

  const kbdHint = kbd ? <kbd className="btn__kbd">{kbd}</kbd> : null;

  if (href !== undefined) {
    const { ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={cls} href={href} aria-busy={busy || undefined} {...anchorRest}>
        {children}
        {kbdHint}
      </a>
    );
  }

  const {
    type = "button",
    ...buttonRest
  } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      className={cls}
      type={type}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      {...buttonRest}
    >
      {children}
      {kbdHint}
    </button>
  );
}
