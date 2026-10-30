// src/components/landing/BoundariesGrid.tsx
//
// Condensed "Responsible AI" section. Reduced from 8 large cards to
// 4 compact ones, positioned lower on the page so the hero + map +
// Meta AI showcase get the spotlight first.

import { cn } from "@/lib/utils";

export interface BoundariesGridProps {
  className?: string;
}

const BOUNDARIES = [
  {
    title: "No coordinates, no victims",
    body: "The AI is told not to predict GPS or identify people. Unlocated reports stay off the map.",
  },
  {
    title: "Nothing dispatches",
    body: "The AI never proposes dispatch, response, or rescue. The reviewer owns every verb.",
  },
  {
    title: "Priority is not triage",
    body: "The priority score is provisional review prioritization — never for resource allocation.",
  },
  {
    title: "Corrections preserve the original",
    body: "Reviewer edits overwrite the AI's values. The original model output stays in the audit trail.",
  },
];

export function BoundariesGrid({ className }: BoundariesGridProps) {
  return (
    <section className={cn("boundaries-section", className)}>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-2)" }}>
        Responsible AI
      </h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-4)" }}>
        The AI is a decision-support tool; the reviewer is the authority.
      </p>
      <div className="boundaries" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {BOUNDARIES.map((b) => (
          <div key={b.title} className="boundary" style={{ padding: "var(--s-4)" }}>
            <div className="t-label" style={{ fontSize: "var(--step--1)", marginBottom: "var(--s-1)" }}>
              {b.title}
            </div>
            <p className="t-meta" style={{ fontSize: "var(--step--1)" }}>{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
