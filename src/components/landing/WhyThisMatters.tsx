// src/components/landing/WhyThisMatters.tsx
//
// A high-density strip under the hero explaining why the product matters:
//   1. Photos arrive fast
//   2. Teams get overwhelmed
//   3. AI helps organize
//   4. Humans verify what's true
//
// Responsive layout: 4 columns on desktop (1440px), 2x2 grid on tablet (768px–1024px),
// 1-column with 24px vertical spacing on mobile (320px–480px).
//
// Server component — no interactivity.

import { Camera, Users, Sparkles, CheckCircle2 } from "lucide-react";

export function WhyThisMatters() {
  const points = [
    {
      icon: Camera,
      label: "Disaster photos arrive fast",
      detail: "Community members and field personnel submit hundreds of photos during floods, landslides, and typhoons.",
      accent: "text-cyan-400 bg-cyan-950/60 border-cyan-800/40",
    },
    {
      icon: Users,
      label: "Response teams get overwhelmed",
      detail: "Disaster Operations Centers cannot manually open, geolocate, and cross-reference every individual photo before acting.",
      accent: "text-amber-400 bg-amber-950/60 border-amber-800/40",
    },
    {
      icon: Sparkles,
      label: "Meta AI parses & isolates",
      detail: "Vision models extract structured hazard evidence, estimate severity, and flag optical uncertainties instantly.",
      accent: "text-indigo-400 bg-indigo-950/60 border-indigo-800/40",
    },
    {
      icon: CheckCircle2,
      label: "Human supervisors seal decisions",
      detail: "An authorized operator confirms or adjusts findings. The digital seal resolves before emergency dispatch.",
      accent: "text-emerald-400 bg-emerald-950/60 border-emerald-800/40",
    },
  ];

  return (
    <section className="w-full border-y border-slate-800/80 bg-slate-900/60 backdrop-blur-md py-10 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
            Operational Triage Realities
          </span>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-100">
            Why this matters in the field
          </h2>
        </div>

        {/* 4 columns on desktop, 2x2 on tablet, 1-col with 24px vertical spacing (gap-6) on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {points.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-5 flex flex-col justify-between shadow-sm hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-lg border ${p.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-mono font-bold text-slate-600/70">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-200 mb-2 leading-snug">
                    {p.label}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {p.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
