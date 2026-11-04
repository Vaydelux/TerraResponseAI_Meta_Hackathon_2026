"use client";

import { Building2, Flame, HeartPulse, Layers, Search, ShieldAlert, Trash2, Waves, HelpCircle } from "lucide-react";
import { classifyHazard, type HazardFilter, type WorkspaceReport } from "@/lib/workspace/incidents";

import { workspaceAction } from "@/lib/workspace/presentation";

const HAZARDS = [
  { id: "all", label: "All hazards", icon: Layers }, { id: "flood", label: "Flood", icon: Waves },
  { id: "hazmat", label: "Fire & Hazmat", icon: Flame }, { id: "medical", label: "Medical & Rescue", icon: HeartPulse },
  { id: "structural", label: "Structural", icon: Building2 }, { id: "road", label: "Blocked road", icon: ShieldAlert },
  { id: "debris", label: "Debris", icon: Trash2 }, { id: "other", label: "Other / Unclassified", icon: HelpCircle },
] as const;

export interface IncidentFiltersProps {
  reports: WorkspaceReport[]; hazard: HazardFilter; query: string; sort: "priority" | "newest";
  onHazardChange: (hazard: HazardFilter) => void; onQueryChange: (query: string) => void;
  onSortChange: (sort: "priority" | "newest") => void;
}

export function IncidentFilters({ reports, hazard, query, sort, onHazardChange, onQueryChange, onSortChange }: IncidentFiltersProps) {
  const counts = new Map<HazardFilter, number>();
  reports.forEach((report) => { const type = classifyHazard(report); counts.set(type, (counts.get(type) ?? 0) + 1); });
  return (
    <section className="grid min-w-0 max-w-full gap-3" aria-label="Incident filters">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex min-h-11 min-w-0 items-center gap-3 rounded-ctl border border-[var(--rule-strong)] bg-sheet px-3 focus-within:ring-2 focus-within:ring-tide">
          <Search className="size-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" /><span className="sr-only">Search incidents</span>
          <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search location, title, or report ID" maxLength={240} className="min-h-11 w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-[var(--ink-3)] focus-visible:shadow-none" />
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-[var(--ink-2)]"><span className="shrink-0">Sort by</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as "priority" | "newest")} className="min-h-11 min-w-0 flex-1 rounded-ctl border border-[var(--rule-strong)] bg-sheet px-3 text-sm text-ink hover:border-tide focus-visible:outline-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)]"><option value="priority">Priority</option><option value="newest">Newest reported</option></select>
        </label>
      </div>
      <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2" role="group" aria-label="Filter incidents by hazard">
        {HAZARDS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={hazard === id} onClick={() => onHazardChange(id)} className={`${workspaceAction} shrink-0 whitespace-nowrap rounded-full ${hazard === id ? "border-[var(--tide)] bg-[var(--tide-wash)] text-[var(--tide)]" : ""}`}><Icon className="size-4" aria-hidden="true" /><span>{label}</span><span className="rounded-full bg-[var(--sheet-sunk)] px-2 font-mono text-xs text-[var(--ink-2)]">{id === "all" ? reports.length : counts.get(id) ?? 0}</span></button>)}
      </div>
    </section>
  );
}
