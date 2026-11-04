import { UploadCloud, Sparkles, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrustModelDiagramProps { className?: string }

const LANES = [
  { label: "Contributor uploads", caption: "A photograph and supplied location enter the report workflow. Nothing is automatically dispatched to responders.", icon: UploadCloud, tag: "Field input" },
  { label: "Meta AI observes", caption: "Muse Spark proposes observations with explicit uncertainty. Its output is a draft, not a confirmed finding.", icon: Sparkles, tag: "Unverified AI proposal" },
  { label: "Reviewer decides", caption: "An authorized reviewer inspects the evidence and confirms, corrects, flags, or rejects the observation.", icon: UserCheck, tag: "Human decision" },
] as const;

export function TrustModelDiagram({ className }: TrustModelDiagramProps) {
  return (
    <section aria-labelledby="trust-heading" className={cn("mt-12 grid min-w-0 gap-6 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet-sunk)] p-4 sm:mt-16 sm:p-6", className)}>
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tide)]">An explicit boundary</p>
        <h2 id="trust-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">Human-supervised from the start</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">The interface separates a model proposal from a human review decision at every step.</p>
      </div>
      <ol className="grid min-w-0 gap-4 min-[1100px]:grid-cols-3">
        {LANES.map((lane, index) => {
          const Icon = lane.icon;
          return (
            <li key={lane.label} className="grid min-w-0 content-start gap-4 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet)] p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-3"><Icon size={22} className="shrink-0 text-[var(--tide)]" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">0{index + 1} · {lane.tag}</span></div>
              <h3 className="text-base font-semibold text-[var(--ink)]">{lane.label}</h3>
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">{lane.caption}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
