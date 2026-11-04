import { Cpu, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { SampleImage } from "./SampleImage";
import { SAMPLE_OBSERVATIONS, SAMPLE_UNCERTAINTIES } from "./sample-data";

export function MetaAIShowcase() {
  return (
    <section aria-labelledby="ai-showcase-heading" className="mt-12 grid min-w-0 gap-6 sm:mt-16">
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--tide)]"><Cpu size={16} aria-hidden="true" />Meta AI workflow</p>
        <h2 id="ai-showcase-heading" className="text-[length:var(--step-3)] font-bold text-[var(--ink)]">AI proposes. A person decides.</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Muse Spark can organize visual evidence into structured observations. SAM 3.1 segmentation can be requested in the review workflow. These sample cards are illustrative; no live inference runs on this page.</p>
      </div>

      <div className="grid min-w-0 gap-6 min-[1100px]:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4">
          <h3 className="text-base font-semibold text-[var(--ink)]">1. Synthetic sample image</h3>
          <SampleImage caption="This image is synthetic and is not a contributor report. In the real workflow, submitted photographs are stored privately and an optimized derivative is used for analysis." />
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <h3 className="text-base font-semibold text-[var(--ink)]">2. Example observations</h3>
          <div className="grid min-w-0 gap-4 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet)] p-4">
            <p className="rounded-[var(--r-ctl)] bg-[var(--amber-wash)] p-3 text-sm font-semibold text-[var(--amber-ink)]">AI generated, not verified</p>
            <h4 className="flex items-start gap-2 text-base font-semibold text-[var(--ink)]"><Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--amber-ink)]" aria-hidden="true" />Possible roadway flooding</h4>
            <ul className="grid gap-3 text-sm leading-relaxed text-[var(--ink-2)]">
              {SAMPLE_OBSERVATIONS.map((finding) => <li key={finding} className="flex items-start gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--amber)]" aria-hidden="true" /><span>{finding}</span></li>)}
            </ul>
            <div className="grid gap-2 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet-sunk)] p-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><ShieldAlert size={16} className="shrink-0" aria-hidden="true" />Still unknown</h4>
              <ul className="grid gap-2 text-sm leading-relaxed text-[var(--ink-2)]">{SAMPLE_UNCERTAINTIES.map((uncertainty) => <li key={uncertainty}>{uncertainty}</li>)}</ul>
            </div>
            <p className="text-xs leading-relaxed text-[var(--ink-3)]">Example observation · No model confidence measured</p>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <h3 className="text-base font-semibold text-[var(--ink)]">3. Optional spatial context</h3>
          <SampleImage conceptHighlight caption="Segment Anything (SAM 3.1) can produce masks on request. This rectangle is only an illustrative concept, not model-generated segmentation. A real mask appears only when returned by the model." />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-4 sm:p-6">
        <h3 className="flex items-start gap-2 text-base font-semibold text-[var(--ink)]"><UserCheck size={20} className="shrink-0 text-[var(--tide)]" aria-hidden="true" />An example of human correction</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--ink-2)]">This fictional before-and-after shows how a reviewer can correct an observation. It is not a saved review or a verified claim about road conditions. In the real workflow, review history is separate from the original model output.</p>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--amber-wash)] p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--amber-ink)]">Fictional AI proposal</h4>
            <p className="text-sm leading-relaxed text-[var(--ink)]">The road may be impassable.</p>
          </div>
          <div className="grid min-w-0 gap-2 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet-sunk)] p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-2)]">Fictional reviewer correction</h4>
            <p className="text-sm leading-relaxed text-[var(--ink)]">Passability is unknown; further field information is required.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
