import { Camera, Users, Sparkles, CheckCircle2 } from "lucide-react";

const POINTS = [
  { icon: Camera, label: "Photos arrive from the field", detail: "Community members and field teams contribute photographs during floods, landslides, and typhoons." },
  { icon: Users, label: "Context is scattered", detail: "Teams need a way to inspect the image, supplied location, and related reports without losing their place." },
  { icon: Sparkles, label: "AI helps organize", detail: "Vision models propose structured observations and make what remains uncertain visible to a reviewer." },
  { icon: CheckCircle2, label: "People make the decision", detail: "An authorized reviewer confirms, corrects, or rejects an observation. The interface keeps that responsibility explicit." },
] as const;

export function WhyThisMatters() {
  return (
    <section aria-labelledby="why-heading" className="min-w-0 border-y border-[var(--rule)] bg-[var(--sheet-sunk)] py-12">
      <div className="mx-auto grid w-full max-w-[var(--content-max)] min-w-0 gap-6 px-4 sm:px-6 lg:px-10">
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tide)]">Built around the review task</p>
          <h2 id="why-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">Why this matters in the field</h2>
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 min-[1200px]:grid-cols-4">
          {POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.label} className="grid min-w-0 content-start gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-4 sm:p-6">
                <span className="grid size-12 place-items-center rounded-[var(--r-ctl)] bg-[var(--tide-wash)] text-[var(--tide)]"><Icon size={22} aria-hidden="true" /></span>
                <h3 className="text-base font-semibold leading-snug text-[var(--ink)]">{point.label}</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-2)]">{point.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
