import { MapPin, Github, ArrowUpRight } from "lucide-react";
import { WorkspaceLink } from "./WorkspaceLink";

export function FinalCTA({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="cta-heading" className="min-w-0 border-t border-[var(--rule)] bg-[var(--sheet-sunk)] py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-[var(--content-max)] min-w-0 gap-8 px-4 sm:px-6 lg:px-10">
        <div className="grid max-w-2xl gap-3">
          <h2 id="cta-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold leading-tight text-[var(--ink)]">Put the evidence and the next decision in view.</h2>
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">Explore fictional sample incidents here, then sign in to work with the reports your team is authorized to access. People review AI observations before confirming a real report.</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap">
          <WorkspaceLink signedIn={signedIn} className="sm:w-auto" />
          <a href="#incident-map-preview" className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-[var(--rule-strong)] bg-[var(--sheet)] px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tide)] active:bg-[var(--sheet-sunk)] sm:w-auto motion-reduce:transition-none"><MapPin size={16} className="shrink-0" aria-hidden="true" /><span>Explore sample incidents</span></a>
          <a href="https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-[var(--rule-strong)] px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--sheet)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tide)] active:bg-[var(--tide-wash)] sm:w-auto motion-reduce:transition-none"><Github size={16} className="shrink-0" aria-hidden="true" /><span>View GitHub</span><ArrowUpRight size={16} className="shrink-0" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
        </div>
      </div>
    </section>
  );
}
