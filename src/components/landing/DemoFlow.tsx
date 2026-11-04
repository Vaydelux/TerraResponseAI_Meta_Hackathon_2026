import { UploadCloud, Sparkles, UserCheck, MapPin } from "lucide-react";

const STEPS = [
  { label: "Upload photo", detail: "A contributor uploads a disaster photo with optional EXIF GPS or a manual location pin. Original evidence remains in private storage.", icon: UploadCloud, badge: "Ingestion" },
  { label: "AI observes", detail: "Muse Spark proposes structured observations, severity, and explicit uncertainties. Its output remains unverified until human review.", icon: Sparkles, badge: "AI proposal" },
  { label: "Reviewer decides", detail: "An authorized reviewer confirms, corrects, or rejects an observation. Review history records the decision separately from the initial AI output.", icon: UserCheck, badge: "Human authority" },
  { label: "Inspect the map", detail: "Located reports can be inspected on the incident map alongside the queue. A report does not automatically dispatch responders.", icon: MapPin, badge: "Coordination" },
] as const;

export function DemoFlow() {
  return (
    <section id="how-it-works" aria-labelledby="flow-heading" className="grid min-w-0 scroll-mt-40 gap-6 sm:scroll-mt-24">
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tide)]">From evidence to decision</p>
        <h2 id="flow-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">How it works</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Four steps connect a community photo with a reviewable incident report. People retain the authority to confirm the findings.</p>
      </div>
      <ol className="grid min-w-0 gap-4 md:grid-cols-2 min-[1200px]:grid-cols-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.label} className="grid min-w-0 content-start gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="grid size-12 place-items-center rounded-[var(--r-ctl)] bg-[var(--tide-wash)] text-[var(--tide)]"><Icon size={22} aria-hidden="true" /></span>
                <span className="font-mono text-xl tabular-nums text-[var(--ink-3)]">0{index + 1}</span>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">{step.badge}</p>
                <h3 className="text-base font-semibold leading-snug text-[var(--ink)]">{step.label}</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-2)]">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
