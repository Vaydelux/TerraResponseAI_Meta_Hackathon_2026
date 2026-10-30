// src/components/report/PriorityBreakdown.tsx
//
// The 5-factor stacked priority bar (components.css §7.5). Each
// segment's width is that factor's contribution (`--w` inline, set
// as a percentage). The score number is printed in Bricolage
// Grotesque; the legend explains each factor. The caption is fixed
// copy from `COPY.priorityCaption` — never overridable, per the
// design thesis: "Provisional review prioritization, not for triage
// or resource allocation".
//
// Each factor segment has a tooltip (the `.ui-tr-tooltip` surface)
// showing the factor name + points + derivation. The factor list
// comes from `/api/reports/[id]/priority` (the `factors` field of
// the PriorityResult). The number of segments rendered equals the
// number of factors; the CSS colors them in severity-ramp order
// via `.priority__seg:nth-child(N)`.
//
// Server-component friendly (Tooltip is a CSS-only component, no
// 'use client' needed).

import { Fragment, type CSSProperties } from "react";
import { Tooltip } from "@/components/ui-tr/Tooltip";
import { COPY } from "@/lib/design/copy";
import { cn } from "@/lib/utils";

export interface PriorityFactor {
  /** Factor display name (e.g. "Visual severity"). */
  name: string;
  /** 0–100 contribution to the score (matches points/maxPoints*100). */
  value: number;
  /** The factor's weight (the max possible). Displayed in the tooltip. */
  weight: number;
  /** Human-readable derivation of the value. */
  derivation: string;
  /** Status badge (assessed / unassessed / unverified). */
  status?: "assessed" | "unassessed" | "unverified";
}

export interface PriorityBreakdownProps {
  score: number;
  factors: PriorityFactor[];
  className?: string;
}

const SEGMENT_COLORS = [
  "var(--sev-5)",
  "var(--sev-4)",
  "var(--sev-3)",
  "var(--sev-2)",
  "var(--sev-1)",
] as const;

export function PriorityBreakdown({ score, factors, className }: PriorityBreakdownProps) {
  return (
    <div className={cn("priority", className)} role="group" aria-label="Priority breakdown">
      <div className="priority__score">
        <span className="priority__score-num num">{score}</span>
        <span className="t-meta">/ 100 · provisional</span>
      </div>
      <div className="priority__bar" aria-hidden="true">
        {factors.length === 0 && (
          <span className="priority__seg" style={{ "--w": 0 } as CSSProperties} />
        )}
        {factors.map((f, i) => (
          <Tooltip
            key={f.name}
            side="top"
            content={
              <span style={{ display: "grid", gap: 2 }}>
                <span style={{ fontWeight: 700 }}>{f.name}</span>
                <span>{f.value} / {f.weight} points</span>
                <span style={{ color: "var(--ink-3)" }}>{f.derivation}</span>
              </span>
            }
          >
            <span
              className="priority__seg"
              style={{ "--w": f.value } as CSSProperties}
              data-status={f.status ?? "assessed"}
              aria-label={`${f.name}: ${f.value} of ${f.weight}`}
            />
          </Tooltip>
        ))}
      </div>
      <dl className="priority__legend">
        {factors.map((f, i) => (
          <Fragment key={f.name}>
            <dt style={{ "--c": SEGMENT_COLORS[i] ?? "var(--rule)" } as CSSProperties}>{f.name}</dt>
            <dd className="num">{f.value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="priority__caption">{COPY.priorityCaption}</div>
    </div>
  );
}
