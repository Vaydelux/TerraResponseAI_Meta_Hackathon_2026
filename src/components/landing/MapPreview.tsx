"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { getLandingPreviewSnapshot } from "./sample-data";
import { SampleImage } from "./SampleImage";
import { WorkspaceLink } from "./WorkspaceLink";

const PREVIEW_INCIDENTS = getLandingPreviewSnapshot().incidents;

export function MapPreview({ signedIn = false }: { signedIn?: boolean }) {
  const [selectedId, setSelectedId] = useState(PREVIEW_INCIDENTS[0].id);
  const selected = PREVIEW_INCIDENTS.find((incident) => incident.id === selectedId) ?? PREVIEW_INCIDENTS[0];

  return (
    <section id="incident-map-preview" aria-labelledby="preview-heading" className="mt-12 grid min-w-0 gap-4 sm:mt-16">
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tide)]">Explore the workspace</p>
        <h2 id="preview-heading" className="font-[family-name:var(--font-display)] text-[length:var(--step-3)] font-bold text-[var(--ink)]">One map. A clearer next step.</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Select a sample pin to see how location and incident details stay connected. These fictional reports are an illustration, not live emergency information.</p>
      </div>

      <div className="grid min-w-0 gap-4 rounded-[var(--r-panel)] border border-[var(--rule)] bg-[var(--sheet)] p-3 sm:p-4 min-[1100px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-3">
          <div className="relative h-72 min-w-0 overflow-hidden rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet-sunk)] sm:h-[400px]" role="group" aria-label="Illustrative map, select a sample incident">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 text-[var(--rule-strong)]">
              <path d="M0 62 Q22 40 40 58 T100 56 L100 100 L0 100 Z" fill="var(--tide-wash)" />
              <path d="M6 20 L94 30 M15 84 L88 68 M48 0 L54 100 M0 42 L100 38" stroke="currentColor" strokeWidth="1" fill="none" />
              <path d="M9 11 L25 92 M80 0 L72 100 M0 74 L100 80" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" fill="none" />
            </svg>
            {PREVIEW_INCIDENTS.map((incident, index) => (
              <button
                key={incident.id}
                type="button"
                aria-label={`Select sample: ${incident.label}`}
                aria-pressed={selectedId === incident.id}
                aria-controls="preview-incident-detail"
                onClick={() => setSelectedId(incident.id)}
                className="absolute grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--amber)] bg-[var(--amber-wash)] text-[var(--amber-ink)] transition-colors hover:bg-[var(--sheet)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tide)] active:bg-[var(--sheet-sunk)] aria-pressed:border-[var(--tide)] aria-pressed:bg-[var(--tide-wash)] aria-pressed:text-[var(--tide)] motion-reduce:transition-none"
                style={{ left: `${incident.position.x}%`, top: `${incident.position.y}%` }}
              >
                <MapPin size={22} aria-hidden="true" />
                <span className="sr-only">Sample {index + 1}</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-2)]">
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border-2 border-[var(--amber)] bg-[var(--amber-wash)]" aria-hidden="true" />Unverified sample</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border-2 border-[var(--tide)] bg-[var(--tide-wash)]" aria-hidden="true" />Selected sample</span>
            <span>Illustrative positions; no real coordinates</span>
          </div>
        </div>

        <div id="preview-incident-detail" className="grid min-w-0 content-start gap-4 rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet-sunk)] p-4 [overflow-wrap:anywhere]">
          <div className="grid gap-2" aria-live="polite" aria-atomic="true">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Selected fictional report</p>
            <h3 className="break-words text-[length:var(--step-2)] font-bold text-[var(--ink)]">{selected.label}</h3>
            <p className="text-sm font-semibold text-[var(--tide)]">{selected.hazard} · Unverified sample</p>
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">{selected.summary}</p>
            <p className="rounded-[var(--r-ctl)] border border-[var(--rule)] bg-[var(--sheet)] p-3 text-sm leading-relaxed text-[var(--ink-2)]"><strong>Still unknown: </strong>{selected.uncertainty}</p>
          </div>
          {selected.hasImage && <SampleImage />}
          <WorkspaceLink signedIn={signedIn} />
        </div>
      </div>
    </section>
  );
}
