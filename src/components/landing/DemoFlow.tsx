// src/components/landing/DemoFlow.tsx
//
// Interactive demo flow — a visual 4-step walkthrough showing the
// product's core pipeline:
//   01. Upload photo
//   02. AI observation (Muse Spark)
//   03. Review decision (human authority)
//   04. Incident appears on map
//
// Fully responsive across Desktop (4 columns), Tablet (2x2 grid),
// and Mobile (1-column stack with dynamic auto-heights).
//
// Server component.

import { UploadCloud, Sparkles, UserCheck, MapPin, ArrowRight } from "lucide-react";

export function DemoFlow() {
  const steps = [
    {
      n: 1,
      label: "Upload photo",
      detail: "A contributor uploads a disaster photo with optional EXIF GPS or manual location pin. Evidence remains untampered in private storage.",
      icon: UploadCloud,
      border: "border-slate-800",
      accent: "text-slate-200 bg-slate-800/80 border-slate-700",
      badge: "Step 01 · Ingestion",
      badgeColor: "text-slate-400 bg-slate-900 border-slate-800",
    },
    {
      n: 2,
      label: "AI observes",
      detail: "Muse Spark parses optical features, proposes severity levels, and flags confidence gaps. The status is unverified until human review.",
      icon: Sparkles,
      border: "border-amber-600/40",
      accent: "text-amber-400 bg-amber-950/60 border-amber-800/50",
      badge: "Step 02 · Inference",
      badgeColor: "text-amber-300 bg-amber-950/80 border-amber-800/60",
    },
    {
      n: 3,
      label: "Reviewer decides",
      detail: "An authorized operator confirms, adjusts severity, or rejects false alarms. The cryptographic verification seal is signed and locked.",
      icon: UserCheck,
      border: "border-emerald-600/40",
      accent: "text-emerald-400 bg-emerald-950/60 border-emerald-800/50",
      badge: "Human Authority",
      badgeColor: "text-emerald-300 bg-emerald-950/80 border-emerald-700/60",
    },
    {
      n: 4,
      label: "Incident on map",
      detail: "Sealed incidents become authoritative tactical pins on the PostGIS command map, triggering real-time agency coordination.",
      icon: MapPin,
      border: "border-cyan-600/40",
      accent: "text-cyan-400 bg-cyan-950/60 border-cyan-800/50",
      badge: "Step 04 · Dispatch",
      badgeColor: "text-cyan-300 bg-cyan-950/80 border-cyan-800/60",
    },
  ];

  return (
    <section id="how-it-works" className="mt-14 sm:mt-16 md:mt-20">
      <div className="mb-6">
        <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
          End-to-End Pipeline
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 mb-2">
          How it works
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
          Four structured steps from raw community photo to verified tactical incident.
          AI accelerates triage, but human operators always retain the authority to act.
        </p>
      </div>

      {/* Responsive step grid: 4 cols on desktop, 2x2 on tablet, 1-col on mobile with dynamic auto-heights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`rounded-xl border ${s.border} bg-slate-900/60 backdrop-blur-md p-5 flex flex-col justify-between shadow-sm hover:border-slate-700 transition-colors h-auto`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-lg border ${s.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-mono font-bold text-slate-600">
                    0{s.n}
                  </span>
                </div>

                <div className="mb-2">
                  <span className={`inline-block text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${s.badgeColor} mb-2`}>
                    {s.badge}
                  </span>
                  <h3 className="text-base font-semibold text-slate-100">
                    {s.label}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  {s.detail}
                </p>
              </div>

              {s.n === 3 && (
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                    ✓ Non-bypassable verification gate
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
