// src/components/review/EvidenceList.tsx
//
// The "What the model saw" list — short factual observations of what
// is visible in the image. Each item is `<li class="evidence-list__item">`
// with a check-style marker (`.evidence-list__mark`) + the text. The
// mark color comes from the parent's `data-state` attribute (amber when
// pending, green when resolved — see components.css §7.5).
//
// Per docs/DESIGN.md §6, this list is rendered in the same visual
// weight as the UncertaintyList — uncertainties are first-class.
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface EvidenceListProps {
  items: string[];
  className?: string;
}

export function EvidenceList({ items, className }: EvidenceListProps) {
  if (items.length === 0) {
    return (
      <ul className={cn("evidence-list", className)}>
        <li className="evidence-list__item">
          <span className="evidence-list__mark" aria-hidden="true">
            <CheckMark />
          </span>
          <span className="t-meta">The model produced no visible-evidence observations.</span>
        </li>
      </ul>
    );
  }
  return (
    <ul className={cn("evidence-list", className)}>
      {items.map((item, i) => (
        <li key={i} className="evidence-list__item">
          <span className="evidence-list__mark" aria-hidden="true">
            <CheckMark />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CheckMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 9.2 7.2 12.7 14.4 5.4" />
    </svg>
  );
}
