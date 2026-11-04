import { Check, Sparkles } from "lucide-react";

const CAPABILITIES = [
  { label: "Structured observations", caption: "A description of the image", terra: "Incident type, severity, visible evidence, and explicit uncertainties" },
  { label: "Location context", caption: "Location remains separate", terra: "Supplied GPS or a manual pin, shown alongside report details" },
  { label: "Human review", caption: "No review decision in the caption", terra: "An authorized reviewer confirms, corrects, flags, or rejects" },
  { label: "Explainable priority", caption: "No queue context", terra: "A provisional score organizes human attention, with a visible breakdown" },
  { label: "Review history", caption: "A single text response", terra: "Review actions stay separate from the original model output" },
  { label: "Scoped workspace", caption: "Access control sits outside captioning", terra: "Event membership and role permissions determine access to reports" },
] as const;

export function WhatMakesDifferent() {
  return (
    <section aria-labelledby="difference-heading" className="mt-12 grid min-w-0 gap-6 sm:mt-16">
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--tide)]"><Sparkles size={16} aria-hidden="true" />Beyond the image caption</p>
        <h2 id="difference-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">What makes this different</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">A caption is a starting point. TerraResponse connects observations with location, review history, and a queue that people can act on.</p>
      </div>
      <dl className="grid min-w-0 gap-4 md:gap-0 md:overflow-hidden md:rounded-[var(--r-panel)] md:border md:border-[var(--rule)]">
        {CAPABILITIES.map((capability) => (
          <div key={capability.label} className="grid min-w-0 gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:rounded-none md:border-0 md:border-b md:p-6 md:last:border-b-0">
            <dt className="text-base font-semibold leading-snug text-[var(--ink)]">{capability.label}</dt>
            <dd className="grid min-w-0 content-start gap-2 text-sm leading-relaxed text-[var(--ink-2)]"><span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">A caption alone</span>{capability.caption}</dd>
            <dd className="grid min-w-0 content-start gap-2 text-sm leading-relaxed text-[var(--ink)]"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--tide)]"><Check size={16} className="shrink-0" aria-hidden="true" />TerraResponse</span>{capability.terra}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
