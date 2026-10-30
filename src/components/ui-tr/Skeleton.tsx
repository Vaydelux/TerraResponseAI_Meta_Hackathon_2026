// src/components/ui-tr/Skeleton.tsx
//
// `.skeleton` block — a shimmer placeholder (components.css §7.9).
// Use `Skeleton` for inline blocks, `SkeletonRow` for the list
// loading state (a thumbnail block + two text blocks).
//
// Server-component friendly.

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  /** Width as a CSS string ("100%", "12rem", "120px"). */
  width?: string;
  /** Height as a CSS string. */
  height?: string;
  className?: string;
  /** Inline style; used for the `width`/`height` so we don't fight
   *  Tailwind utilities. */
  style?: CSSProperties;
}

export function Skeleton({ width, height, className, style }: SkeletonProps) {
  return (
    <span
      className={cn("skeleton", className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonRowProps {
  /** Render a thumbnail block; default true. */
  thumb?: boolean;
  className?: string;
}

export function SkeletonRow({ thumb = true, className }: SkeletonRowProps) {
  return (
    <div className={cn("report-row", className)} aria-hidden="true">
      {thumb && <span className="skeleton report-row__thumb" />}
      <span style={{ display: "grid", gap: 8, flex: 1 }}>
        <Skeleton width="60%" height="14px" />
        <Skeleton width="40%" height="12px" />
      </span>
      <Skeleton width="32px" height="32px" />
    </div>
  );
}
