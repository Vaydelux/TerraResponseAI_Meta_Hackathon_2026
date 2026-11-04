// src/components/landing/TrustModelDiagram.tsx
//
// A responsive three-lane sequence illustrating the trust model:
//   Contributor uploads → AI observes → Reviewer decides
//
// Desktop: 3-lane sequence. Mobile: Stacked 1-column card progression.
// Server component.

import { ArrowRight, UploadCloud, Sparkles, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrustModelDiagramProps {
  className?: string;
}

export function TrustModelDiagram({ className }: TrustModelDiagramProps) {
  const lanes = [
    {
      step: 1,
      label: "Contributor uploads",
      caption: "Photo with optional GPS submitted from the field. Nothing is automatically dispatched to responders.",
      icon: UploadCloud,
      border: "border-slate-800",
      bg: "bg-slate-900/60",
      accent: "text-slate-300 bg-slate-800 border-slate-700",
      tag: "Untrusted Field Input",
      tagColor: "text-slate-400 bg-slate-950/80 border-slate-800",
    },
    {
      step: 2,
      label: "Meta AI observes",
      caption: "Muse Spark scans optical pixels and proposes hazard classification with explicit uncertainty indicators.",
      icon: Sparkles,
      border: "border-amber-600/40 border-dashed",
      bg: "bg-amber-950/20",
      accent: "text-amber-400 bg-amber-950/60 border-amber-800/60",
      tag: "Unverified · AI Draft",
      tagColor: "text-amber-300 bg-amber-950/80 border-amber-800/60",
    },
    {
      step: 3,
      label: "Reviewer decides",
      caption: "A trained emergency coordinator confirms or adjusts the report. Only human sign-off commits the verification seal.",
      icon: UserCheck,
      border: "border-emerald-600/50",
      bg: "bg-emerald-950/20",
      accent: "text-emerald-400 bg-emerald-950/60 border-emerald-800/60",
      tag: "Human Authority Gate",
      tagColor: "text-emerald-300 bg-emerald-950/80 border-emerald-700/60",
    },
  ];

  return (
    <section className={cn("rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 sm:p-8", className)}>
      <div className="mb-6">
        <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
          Governance Architecture
        </span>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-2">
          The Human-Supervised Trust Model
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
          The human operator is always the single source of truth, never the algorithm.
          The interface makes this boundary transparent across every step.
        </p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 list-none p-0 m-0">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          return (
            <li key={lane.label} className="flex">
              <div
                className={`w-full rounded-xl border ${lane.border} ${lane.bg} p-5 flex flex-col justify-between shadow-sm`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2 rounded-lg border ${lane.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${lane.tagColor}`}>
                      {lane.tag}
                    </span>
                  </div>

                  <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block mb-1">
                    Phase 0{lane.step}
                  </span>
                  <h3 className="text-base font-semibold text-slate-100 mb-2">
                    {lane.label}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {lane.caption}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
