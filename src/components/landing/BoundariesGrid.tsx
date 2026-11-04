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
    body: "Models are strictly forbidden from guessing ungrounded GPS or facial recognition. Unverified reports never appear on tactical maps.",
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
    body: "Reviewer corrections never destroy original model predictions. Both states are cryptographically chained in immutable audit tables.",
  },
];

export function BoundariesGrid({ className }: BoundariesGridProps) {
  return (
    <section className={cn("mt-14 sm:mt-16 md:mt-20", className)}>
      <div className="mb-6">
        <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
          Safety Safeguards
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 mb-2">
          Responsible AI Guardrails
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
          Artificial intelligence serves as an operational decision-support tool.
          The human supervisor is always the sole authority.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {BOUNDARIES.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.title}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm"
            >
              <div>
                <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-cyan-400 mb-3.5">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-200 mb-2 leading-snug">
                  {b.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
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
