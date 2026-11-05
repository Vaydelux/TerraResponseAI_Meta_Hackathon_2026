"use client";

import { useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { CinematicHero } from "./CinematicHero";
import { SampleImage } from "./SampleImage";
import { WorkspaceLink } from "./WorkspaceLink";
import { SAMPLE_OBSERVATIONS, SAMPLE_UNCERTAINTIES } from "./sample-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui-tr/Button";

export interface HeroProps {
  signedIn?: boolean;
  className?: string;
}

export function Hero({ signedIn = false, className }: HeroProps) {
  const [simulatedReview, setSimulatedReview] = useState(false);

  return (
    <section className={cn("relative isolate grid min-w-0 bg-[var(--brand-tile)]", className)} aria-labelledby="hero-heading">
      <CinematicHero poster="/hero/terraresponse-poster.jpg" sources={[{ src: "/hero/terraresponse-bg.mp4", type: "video/mp4" }]}>
      <div className="relative z-10 mx-auto grid w-full max-w-[var(--content-max)] min-w-0 items-center gap-8 px-4 pb-8 pt-12 sm:px-6 sm:pb-12 sm:pt-16 min-[1100px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] min-[1100px]:gap-12 lg:px-10">
        <div className="grid min-w-0 gap-6 text-[var(--on-brand-tile)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">TerraResponse AI · Human-supervised response</p>
          <h1 id="hero-heading" className="max-w-[15ch] break-words font-[family-name:var(--font-display)] text-[length:var(--step-4)] font-bold leading-[1.06] tracking-tight text-[var(--on-brand-tile)]">From disaster photos to clearer incident decisions.</h1>
          <p className="max-w-[44ch] text-base leading-relaxed">AI organizes the evidence. People verify the findings. Your team keeps the map, priority queue, and next action in view.</p>
          <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap">
            <WorkspaceLink signedIn={signedIn} className="sm:w-auto focus-visible:outline-[var(--on-brand-tile)]" />
            <Button href="/demo/walkthrough" className="sm:w-auto">Try the sample walkthrough</Button>
            <a href="#incident-map-preview" className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--r-ctl)] border border-current px-5 py-3 text-center text-sm font-semibold text-[var(--on-brand-tile)] transition-colors hover:bg-[var(--brand-tile)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current active:bg-[var(--tide-hover)] sm:w-auto motion-reduce:transition-none">Explore sample incidents</a>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Product principles">
            <li>Human review</li><li>Location context</li><li>Visible uncertainty</li>
          </ul>
        </div>

        <div className="grid min-w-0 overflow-hidden rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] text-[var(--ink)] shadow-[var(--lift)]">
          <SampleImage eager caption="Synthetic image and example observation. This local illustration runs no AI inference and saves no report." className="rounded-none border-0 border-b" />
          <div className="grid min-w-0 gap-4 p-4 sm:p-6">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Illustrative observation</p>
              <h2 className="text-[length:var(--step-2)] font-bold">Possible roadway flooding</h2>
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">{SAMPLE_OBSERVATIONS[0]} A reviewer would inspect the evidence and check the supplied location.</p>
              <p className="text-sm leading-relaxed text-[var(--ink-2)]"><strong>Unknown:</strong> {SAMPLE_UNCERTAINTIES[0]}</p>
            </div>
            <div className="grid gap-3 border-t border-[var(--rule)] pt-4">
              <p role="status" className="flex items-start gap-2 text-sm leading-relaxed text-[var(--ink-2)]"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{simulatedReview ? "Simulated reviewer decision recorded locally. The sample remains synthetic and unverified." : "Try a local review simulation. Only an authorized reviewer can confirm a real report."}</p>
              <button type="button" onClick={() => setSimulatedReview((previous) => !previous)} aria-pressed={simulatedReview} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-[var(--rule-strong)] bg-[var(--sheet)] px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tide)] active:bg-[var(--tide-wash)] motion-reduce:transition-none">
                {simulatedReview && <RotateCcw size={16} className="shrink-0" aria-hidden="true" />}{simulatedReview ? "Reset the local simulation" : "Simulate a reviewer decision"}
              </button>
            </div>
          </div>
        </div>
      </div>
      </CinematicHero>
    </section>
  );
}
