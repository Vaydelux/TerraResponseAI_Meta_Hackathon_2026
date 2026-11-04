// src/components/landing/MapPreview.tsx
//
// A high-density preview of the incident map on the landing page.
// Shows confirmed incidents as solid green pins + pending ones (hatched amber).
//
// Responsive layout:
// Desktop/Tablet: Floating tactical incident panel docked on the right.
// Mobile: Clean stacked preview with high-legibility incident card below the map.
// Includes Material 3 zoom-in/zoom-out control group with 44x44px touch targets
// and subtle terra-card-hover elevation.

"use client";

import { useState } from "react";
import { MapPin, CheckCircle, ExternalLink, Plus, Minus, RotateCcw } from "lucide-react";

export function MapPreview() {
  const [zoomScale, setZoomScale] = useState(1);

  const incidents = [
    { x: 22, y: 35, state: "confirmed", sev: 4, label: "Flooded road" },
    { x: 55, y: 48, state: "confirmed", sev: 3, label: "Structural damage" },
    { x: 38, y: 62, state: "pending", sev: 2, label: "Debris" },
    { x: 68, y: 28, state: "confirmed", sev: 5, label: "Bridge collapse" },
    { x: 78, y: 55, state: "pending", sev: 3, label: "Landslide" },
    { x: 45, y: 75, state: "confirmed", sev: 2, label: "Road closure" },
  ];

  function handleZoomIn() {
    setZoomScale((prev) => Math.min(1.6, Number((prev + 0.2).toFixed(2))));
  }

  function handleZoomOut() {
    setZoomScale((prev) => Math.max(0.8, Number((prev - 0.2).toFixed(2))));
  }

  function handleResetZoom() {
    setZoomScale(1);
  }

  return (
    <section id="incident-map-preview" className="mt-14 sm:mt-16 md:mt-20">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
        <div>
          <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
            Tactical Operations Preview
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
            Illustrative incident-map preview
          </h2>
        </div>
        <span className="text-xs text-slate-400">
          Example pins only; no live incident data. Solid = confirmed by operator · Hatched = pending triage
        </span>
      </div>

      <div className="map-panel terra-card-hover !static !w-full !max-w-full !max-h-none rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-2xl flex flex-col md:block relative">
        {/* Map Canvas Mockup */}
        <div className="relative w-full h-[280px] sm:h-[360px] md:h-[440px] bg-slate-950 overflow-hidden">
          {/* Zoomable viewport container */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out origin-center"
            style={{ transform: `scale(${zoomScale})` }}
          >
            {/* Stylized dark tactical map background */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              className="absolute inset-0 opacity-40"
            >
              {/* Water areas */}
              <path d="M0,55 Q20,50 30,55 L40,60 Q50,65 60,58 L100,55 L100,100 L0,100 Z" fill="#0E3A53" />
              <path d="M60,0 L65,30 L70,0 Z" fill="#0E3A53" />
              {/* Roads */}
              <path d="M10,20 L90,30 M20,80 L80,70 M50,0 L50,100" stroke="#334155" strokeWidth="1.2" fill="none" />
              <path d="M10,20 L90,30 M20,80 L80,70 M50,0 L50,100" stroke="#475569" strokeWidth="0.4" fill="none" />
              {/* Grid coordinates overlay */}
              <circle cx="50" cy="50" r="30" stroke="#1E293B" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
              <circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
            </svg>

            {/* Incident pins */}
            {incidents.map((inc) => (
              <div
                key={inc.label}
                className="absolute -translate-x-1/2 -translate-y-full cursor-pointer hover:scale-125 transition-transform"
                style={{ left: `${inc.x}%`, top: `${inc.y}%` }}
                title={`${inc.label} — ${inc.state}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shadow-lg ${
                    inc.state === "confirmed"
                      ? "bg-emerald-500 text-slate-950 border-2 border-emerald-300 ring-2 ring-emerald-500/30"
                      : "bg-amber-500 text-slate-950 border-2 border-amber-300 ring-2 ring-amber-500/30"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
            ))}
          </div>

          {/* Material 3 Styled Zoom-In / Zoom-Out Control Group (44x44px touch targets) */}
          <div
            role="group"
            aria-label="Map zoom controls"
            className="absolute top-3 left-3 z-20 flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-xl shadow-xl overflow-hidden divide-y divide-slate-800/90"
          >
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomScale >= 1.6}
              aria-label="Zoom in map preview"
              title="Zoom in"
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-300 active:bg-cyan-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
            >
              <Plus className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomScale <= 0.8}
              aria-label="Zoom out map preview"
              title="Zoom out"
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-300 active:bg-cyan-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
            >
              <Minus className="w-5 h-5" />
            </button>

            {zoomScale !== 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                aria-label="Reset map zoom"
                title="Reset zoom (100%)"
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-cyan-400 hover:bg-cyan-500/15 active:bg-cyan-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Legend: Non-intrusive bottom-left chip */}
          <div className="absolute left-3 bottom-3 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] font-mono text-slate-300 z-10">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              Confirmed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Pending Review
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-cyan-400 tabular-nums">
              {Math.round(zoomScale * 100)}%
            </span>
          </div>

          {/* Floating tactical panel on Desktop / Tablet (md and above) */}
          <div className="map-panel terra-card-hover hidden md:flex flex-col justify-between !top-4 !right-4 !bottom-4 !left-auto !w-80 rounded-xl border border-slate-800 bg-slate-950/90 backdrop-blur-md p-4 shadow-2xl z-20 overflow-y-auto">
            <div>
              <div className="relative aspect-[16/10] rounded-lg overflow-hidden border border-slate-800 mb-3 bg-slate-900">
                <img
                  src="/demo/flood-aerial.png"
                  alt="Aerial flood photo"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 text-[11px] font-mono font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Verified Incident
                </span>
              </div>

              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-slate-100">
                  C-5 Corridor Flooding
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800 text-rose-300">
                  Sev 4
                </span>
              </div>

              <p className="text-xs text-slate-400 font-mono mb-2">
                14.6219° N, 121.0856° E · Pasig Riverway
              </p>

              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Roadway submerged by 1.2m storm surge. 2 commuter buses stranded. MMDA rescue boat deployed.
              </p>
            </div>

            <a
              href="/map"
              className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 text-xs font-semibold transition-colors mt-2 min-h-[44px]"
            >
              <span>Open Authenticated Map</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Mobile docked incident card (visible only < md) */}
        <div className="md:hidden p-4 border-t border-slate-800 bg-slate-950/95 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Verified
              </span>
              <h3 className="text-sm font-semibold text-slate-100">
                C-5 Corridor Flooding
              </h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800 text-rose-300">
              Sev 4
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Roadway submerged by 1.2m storm surge. 2 commuter buses stranded. MMDA rescue boat deployed.
          </p>

          <a
            href="/map"
            className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 text-xs font-semibold transition-colors min-h-[44px]"
          >
            <span>Open Authenticated Map</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

