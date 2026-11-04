// src/components/landing/WhatMakesDifferent.tsx
//
// "What makes this different" — a comparison section showing that
// TerraResponse is not just image captioning. Contrasts a simple
// image analyzer with TerraResponse's structured, location-aware,
// review-workflow, explainable-priority system.
//
// Desktop: Responsive high-contrast comparison table.
// Mobile (< 768px): Responsive stacked comparative cards with clear visual badges.
//
// Server component.

import { Check, X, ShieldAlert, Sparkles } from "lucide-react";

export function WhatMakesDifferent() {
  const rows = [
    {
      label: "Structured observations",
      simple: "Unstructured generic caption text",
      terra: "Schema-validated incident type, severity, evidence list, and explicit uncertainties",
    },
    {
      label: "Location-aware",
      simple: "No GPS or coordinates extracted",
      terra: "EXIF GPS extraction + manual fallback pin + PostGIS spatial cluster queries",
    },
    {
      label: "Review workflow",
      simple: "AI output is unverified and final",
      terra: "Human supervisor confirms, corrects, flags, or rejects — Verification Seal resolves",
    },
    {
      label: "Explainable priority",
      simple: "No automated urgency ranking",
      terra: "Five-factor weighted score (0–100) with transparent derivation and audit logging",
    },
    {
      label: "Audit trail",
      simple: "No history or traceability",
      terra: "Append-only review actions preserve complete before/after verification diff",
    },
    {
      label: "Event-scoped access",
      simple: "Anyone sees all data globally",
      terra: "Strict Supabase Row-Level Security (RLS) — cross-event access blocked at database level",
    },
  ];

  return (
    <section className="mt-14 sm:mt-16 md:mt-20">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Architectural Edge
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 mb-2">
          What makes this different
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
          Not just another image captioner. TerraResponse AI is a structured, location-aware,
          human-supervised incident verification engine built for high-stakes emergency response.
        </p>
      </div>

      {/* Desktop / Tablet view: High-density comparison table */}
      <div className="hidden md:block rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xl">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400 font-semibold">
              <th className="py-3.5 px-5 w-1/3">Core Capability</th>
              <th className="py-3.5 px-5 w-1/3 text-slate-400">Generic Image Analyzer</th>
              <th className="py-3.5 px-5 w-1/3 text-cyan-400">TerraResponse AI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-sm">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-5 font-medium text-slate-200">
                  {r.label}
                </td>
                <td className="py-4 px-5 text-slate-400">
                  <span className="inline-flex items-start gap-2">
                    <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{r.simple}</span>
                  </span>
                </td>
                <td className="py-4 px-5 text-slate-100 bg-cyan-950/20">
                  <span className="inline-flex items-start gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 font-bold" />
                    <span className="font-medium text-cyan-100/90">{r.terra}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view (< 768px): Touch-friendly stacked comparison cards */}
      <div className="md:hidden flex flex-col gap-4">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                0{i + 1} · Capability
              </span>
              <span className="text-sm font-semibold text-slate-200">
                {r.label}
              </span>
            </div>

            {/* Simple / Generic */}
            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3 flex items-start gap-2.5">
              <div className="p-1 rounded bg-rose-950/60 border border-rose-900/50 text-rose-400 shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">
                  Generic Analyzer
                </span>
                <span className="text-xs text-slate-400 mt-0.5">
                  {r.simple}
                </span>
              </div>
            </div>

            {/* TerraResponse AI */}
            <div className="rounded-lg bg-cyan-950/40 border border-cyan-800/60 p-3 flex items-start gap-2.5">
              <div className="p-1 rounded bg-cyan-900/80 border border-cyan-700/60 text-cyan-300 shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-cyan-400 uppercase">
                  TerraResponse AI
                </span>
                <span className="text-xs font-medium text-slate-100 mt-0.5 leading-relaxed">
                  {r.terra}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
