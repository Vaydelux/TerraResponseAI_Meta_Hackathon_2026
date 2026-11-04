// src/components/landing/MetaAIShowcase.tsx
//
// "How Meta AI powers this" — visual demonstration of the underlying intelligence:
//   1. Original uploaded photo (contributor evidence)
//   2. Muse Spark structured findings (with clear unverified indicators)
//   3. SAM 3.1 segmentation overlay (flood-blue highlight)
//   4. Human Reviewer correction diff (audit trail preservation)
//
// Fully responsive across desktop (3 columns), tablet (2 columns / stacked),
// and mobile (1 column stacked) with guaranteed image aspect ratios and high-contrast scrims.

import { Eye, ShieldAlert, Cpu, Sparkles, UserCheck, ArrowRight } from "lucide-react";

export function MetaAIShowcase() {
  const findings = [
    "Floodwater visibly covers roadway surface; depth is not yet confirmed",
    "Vehicles appear stopped on flooded corridor; occupancy is unverified",
    "Residential and commercial structures partially submerged along both shoulders",
    "Downstream corridor exhibits active overland flow toward drainage culvert",
  ];

  const uncertainties = [
    "Exact water depth beyond visible road shoulder cannot be determined from optical photo",
    "Subsurface structural integrity of submerged buildings cannot be assessed",
    "Vehicle occupancy status is unknown until responder arrival",
  ];

  return (
    <section className="mt-14 sm:mt-16 md:mt-20">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Cpu className="w-3.5 h-3.5" />
          Meta AI Pipeline
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 mb-2">
          How Meta AI powers this
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
          Muse Spark parses visual incident evidence into structured hazard observations, while SAM 3.1
          segments spatial risk zones. A human supervisor confirms or corrects every insight before dispatch.
        </p>
      </div>

      {/* Three-panel responsive showcase */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Panel 1: Original photo */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              1. Uploaded Evidence
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              EXIF Stripped
            </span>
          </div>

          <div className="relative w-full aspect-[16/10] bg-slate-950 overflow-hidden">
            <img
              src="/demo/flood-aerial.png"
              alt="Aerial photo of floodwater covering a residential road"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-mono text-slate-300">
              Raw Contributor Evidence
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between">
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Disaster photos arrive from local citizens or field teams. The unedited original is safely archived in private storage while an optimized derivative is fed to the vision models.
            </p>
          </div>
        </div>

        {/* Panel 2: Muse Spark structured findings */}
        <div className="rounded-xl border border-amber-600/40 bg-slate-900/70 overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 border-b border-amber-600/30 bg-amber-950/30 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              2. Structured Observations
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 font-mono">
              AI-Generated · Unverified
            </span>
          </div>

          <div className="p-4 flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Flooding & Roadway Inundation
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Sev 4 / 5
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* Uncertainties card */}
            <div className="mt-2 rounded-lg bg-amber-950/20 border border-amber-900/40 p-3">
              <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Flagged Uncertainties
              </div>
              <ul className="flex flex-col gap-1.5">
                {uncertainties.map((u, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-relaxed">
                    • {u}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-950/50 text-[11px] font-mono text-slate-500">
            Model: muse-spark-1.3 · Confidence: 89%
          </div>
        </div>

        {/* Panel 3: SAM 3.1 Segmentation */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-lg flex flex-col md:col-span-2 lg:col-span-1">
          <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              3. SAM 3.1 Spatial Overlay
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-300 font-mono">
              Masking
            </span>
          </div>

          <div className="relative w-full aspect-[16/10] bg-slate-950 overflow-hidden">
            <img
              src="/demo/flood-aerial.png"
              alt="Flood aerial photo with SAM 3.1 flood region overlay"
              className="w-full h-full object-cover"
            />
            {/* Dynamic visual scrim & segmentation mask */}
            <div
              className="absolute inset-[15%_10%_20%_8%] bg-blue-500/35 border-2 border-blue-400/80 rounded-md pointer-events-none"
              aria-hidden="true"
            />
            <div className="absolute top-2 left-2 px-2.5 py-1 rounded bg-black/80 backdrop-blur-md border border-blue-500/40 text-[11px] font-mono text-blue-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-blue-400" />
              Waterbody Inundation Mask
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between">
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Segment Anything (SAM 3.1) can produce masks on request. This rectangle is only an illustrative concept, not model-generated segmentation. Reviewers independently verify any observation before dispatch.
            </p>
          </div>
        </div>
      </div>

      {/* Reviewer correction diff */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Human-in-the-Loop Audit Diff
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Append-only review_actions ledger
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-400 mb-4 max-w-2xl leading-relaxed">
          When an operator verifies or corrects an AI recommendation, the model&apos;s initial output is never erased. Both records are sealed and preserved with complete cryptographic timestamps.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-amber-950/20 border border-amber-900/40 p-3.5">
            <span className="text-[11px] font-mono font-semibold text-amber-400 uppercase tracking-wider block mb-1">
              AI Proposed Observation (Initial)
            </span>
            <div className="text-xs sm:text-sm text-slate-300 font-medium line-through text-slate-400">
              Flooding · Severity 4 (Critical) · High probability of road impassability
            </div>
          </div>

          <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/50 p-3.5">
            <span className="text-[11px] font-mono font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
              Supervisor Confirmed (Sealed)
            </span>
            <div className="text-xs sm:text-sm text-emerald-100 font-medium">
              Flooding · Severity 3 · Southern lane passable for high-clearance response vehicles
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
