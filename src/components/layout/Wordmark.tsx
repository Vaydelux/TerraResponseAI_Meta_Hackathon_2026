// src/components/layout/Wordmark.tsx
//
// The TerraResponse wordmark — an inline SVG survey-corner glyph
// (24×24, ink stroke, one amber hatch quadrant) + the brand name in
// Bricolage Grotesque. The amber quadrant is the only place amber
// appears decoratively in the product; everywhere else, amber means
// "AI-generated, not verified" (per the design thesis). The mark
// is the exception that proves the rule.
//
// Server-component friendly (no 'use client'); pure SVG + link.

import Link from "next/link";

export interface WordmarkProps {
  /** Render as a link to this href (defaults to "/"). */
  href?: string;
  /** Optional className for layout adjustments. */
  className?: string;
}

export function Wordmark({ href = "/", className }: WordmarkProps) {
  return (
    <Link href={href} className={`wordmark${className ? ` ${className}` : ""}`} aria-label="TerraResponse AI home">
      <svg
        className="wordmark__mark"
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Survey corner: a square with one corner marked. The amber
            hatch quadrant (top-left) is the "unverified" marker; the
            ink corner lines are the survey brackets. */}
        <path
          d="M3 3 H21 V21 H3 Z"
          stroke="currentColor"
          strokeWidth={1.5}
          fill="none"
        />
        {/* The amber hatch quadrant — top-left corner of the square. */}
        <defs>
          <pattern
            id="wm-hatch"
            patternUnits="userSpaceOnUse"
            width={3}
            height={3}
            patternTransform="rotate(135)"
          >
            <rect width={3} height={3} fill="var(--amber)" />
            <rect width={1.5} height={3} fill="var(--amber-wash)" />
          </pattern>
        </defs>
        <rect x={3} y={3} width={9} height={9} fill="url(#wm-hatch)" stroke="none" />
        {/* Survey brackets — the L-shaped corner marks. */}
        <path
          d="M3 9 V3 H9 M21 9 V3 H15 M3 15 V21 H9 M21 15 V21 H15"
          stroke="currentColor"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>TerraResponse</span>
    </Link>
  );
}
