// src/components/landing/FinalCTA.tsx
//
// Final call-to-action section at the bottom of the landing page.
// Three buttons: Watch demo, Explore sample incident, View GitHub.
//
// Fully responsive on mobile (flex-col stacking, 48px touch targets)
// and desktop (fluid horizontal row).
//
// Server component.

import { Play, MapPin, Github, ArrowUpRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="w-full mt-16 sm:mt-20 md:mt-24 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md py-12 sm:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-100 mb-3 leading-tight">
              Ready to coordinate rapid, verified emergency triage?
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Explore the illustrated upload-to-map workflow, inspect live incident thread clusters, or audit the open architecture on GitHub.
            </p>
          </div>

          {/* Action buttons: Stack vertically on mobile, horizontal row on tablet/desktop */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-semibold text-sm sm:text-base transition-colors shadow-lg shadow-cyan-950/50 min-h-[48px] text-center"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Watch 90-sec demo</span>
            </a>

            <a
              href="#incident-map-preview"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 font-semibold text-sm sm:text-base transition-colors min-h-[48px] text-center"
            >
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span>Explore sample incident</span>
            </a>

            <a
              href="https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-transparent hover:bg-slate-800/80 active:bg-slate-900 border border-slate-700/80 text-slate-300 font-medium text-sm sm:text-base transition-colors min-h-[48px] text-center"
            >
              <Github className="w-4 h-4" />
              <span>View GitHub</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
