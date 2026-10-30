// src/components/ui-tr/Table.tsx
//
// Thin wrapper around the `.table` CSS (components.css §7.8). The
// table is a border-spaced panel with sticky-ish headers (the CSS
// handles the rounded corners + header background). Rows can carry
// `data-state` for the left-edge state stripe (pending = amber,
// confirmed = green, rejected = brick — see `.table tr[data-state]`
// in components.css).
//
// Server-component friendly. We export `Table`, `THead`, `TBody`,
// `TR`, `TH`, `TD` so call sites can compose as native elements.

import type { ThHTMLAttributes, TdHTMLAttributes, TableHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("table", className)} {...rest}>
      {children}
    </table>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Sets the left-edge state stripe. */
  state?: "pending" | "confirmed" | "rejected" | "corrected" | "flagged" | "failed";
  /** Marks the row as the active selection (e.g. J/K in the review queue). */
  selected?: boolean;
}

export function TR({ state, selected, className, children, ...rest }: TRProps) {
  return (
    <tr
      className={cn(className)}
      data-state={state}
      data-selected={selected || undefined}
      aria-selected={selected || undefined}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={className} {...rest}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={className} {...rest}>
      {children}
    </td>
  );
}

/** Convenience: a row label cell (used by the audit log + admin tables). */
export function RowLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <TD className={cn("row-label", className)}>{children}</TD>;
}
