// src/components/landing/BoundariesGrid.tsx
//
// Responsible AI & Ethical Guardrails section.
// Four compact cards positioned cleanly with responsive 4-col desktop,
// 2x2 tablet, and 1-column mobile stack.

import { Shield, RadioTower, AlertTriangle, History } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BoundariesGridProps {
  className?: string;
}

const BOUNDARIES = [
  {
    icon: Shield,
    title: "No hallucinated coordinates or PII",
    body: "Location comes from supplied evidence or a manual pin, never an AI guess. AI observations retain an unverified label until a human review decision.",
  },
  {
    icon: RadioTower,
    title: "Zero autonomous dispatch",
    body: "The model cannot trigger alarms, deploy units, or dispatch sirens. The human operational commander owns every action.",
  },
  {
    icon: AlertTriangle,
    title: "Priority is not medical triage",
    body: "The 0–100 score organizes review queues for human attention; it is never used for automated life-or-death resource rationing.",
  },
  {
    icon: History,
    title: "Non-destructive corrections",
    body: "Reviewer corrections are recorded separately from original model predictions, preserving the distinction between an AI proposal and a human decision.",
  },
];

export function BoundariesGrid({ className }: BoundariesGridProps) {
  return (
    <section aria-labelledby="boundaries-heading" className={cn("mt-12 grid min-w-0 gap-6 sm:mt-16", className)}>
      <div className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tide)]">
          Safety Safeguards
        </span>
        <h2 id="boundaries-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">
          Responsible AI Guardrails
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">
          Artificial intelligence serves as an operational decision-support tool.
          The human supervisor is always the sole authority.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 min-[1200px]:grid-cols-4">
        {BOUNDARIES.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.title}
              className="grid min-w-0 content-start gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-4 sm:p-6"
            >
              <div className="grid min-w-0 gap-4">
                <div className="grid size-12 place-items-center rounded-[var(--r-ctl)] bg-[var(--tide-wash)] text-[var(--tide)]">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold leading-snug text-[var(--ink)]">
                  {b.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--ink-2)]">
                  {b.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
