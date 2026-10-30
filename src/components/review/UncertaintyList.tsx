// src/components/review/UncertaintyList.tsx
//
// The "What the model could not determine" list — deliberately the
// SAME visual weight as the EvidenceList (per docs/DESIGN.md §6:
// "Show uncertainty as content. The model's uncertainties are a
// first-class list with the same weight as its findings").
//
// Renders as a `.well-uncertain` containing each uncertainty as a
// `.well-uncertain__item` with a question-mark marker + the text.
// The well is always dashed-bordered (no state-color); it's a
// disclosure of the AI's limits, not a verification state.
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface UncertaintyListProps {
  items: string[];
  className?: string;
}

export function UncertaintyList({ items, className }: UncertaintyListProps) {
  if (items.length === 0) {
    return (
      <div className={cn("well-uncertain", className)}>
        <div className="well-uncertain__item">
          <span aria-hidden="true">
            <QuestionMark />
          </span>
          <span className="t-meta">The model produced no uncertainties.</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("well-uncertain", className)}>
      {items.map((item, i) => (
        <div key={i} className="well-uncertain__item">
          <span aria-hidden="true">
            <QuestionMark />
          </span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6.5c.3-2 4-2.5 4.5 0 .4 1.8-1.5 2.4-1.8 3.6" />
      <circle cx={8.5} cy={13.2} r={0.7} fill="currentColor" stroke="none" />
    </svg>
  );
}
