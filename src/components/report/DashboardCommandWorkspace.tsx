"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, MapPinOff, Pin } from "lucide-react";
import { DeferredGeoCanvas } from "@/components/map/DeferredGeoCanvas";
import { TemporalScrubber } from "@/components/map/TemporalScrubber";
import { IncidentFilters } from "@/components/workspace/IncidentFilters";
import { workspaceAction } from "@/lib/workspace/presentation";
import { IncidentQueue } from "@/components/workspace/IncidentQueue";
import { IncidentEvidenceDetails } from "./IncidentEvidenceDetails";
import { filterWorkspaceReports, getTimeBounds, hasMapLocation, type HazardFilter, type IncidentWorkspaceSnapshot } from "@/lib/workspace/incidents";

export { classifyHazard } from "@/lib/workspace/incidents";
export type { HazardFilter } from "@/lib/workspace/incidents";
export interface DashboardCommandWorkspaceProps { snapshot: IncidentWorkspaceSnapshot; canReview: boolean }

export function DashboardCommandWorkspace({ snapshot, canReview }: DashboardCommandWorkspaceProps) {
  const router = useRouter(); const [isRefreshing, startRefresh] = useTransition();
  const [lastSnapshot, setLastSnapshot] = useState(snapshot);
  const [lastUsable, setLastUsable] = useState<IncidentWorkspaceSnapshot | null>(snapshot.state !== "unavailable" ? snapshot : null);
  const current = snapshot.state === "unavailable" && lastUsable?.eventId === snapshot.eventId ? lastUsable : snapshot;
  const isStale = current !== snapshot; const reports = current.reports;
  const [hazard, setHazard] = useState<HazardFilter>("all"); const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"priority" | "newest">("priority"); const [pct, setPct] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [pinned, setPinned] = useState<string[]>([]); const [queueLimit, setQueueLimit] = useState(5);
  // Adjust identity-dependent state before React commits the new snapshot.
  if (lastSnapshot !== snapshot) {
    setLastSnapshot(snapshot);
    if (snapshot.state !== "unavailable") {
      setLastUsable(snapshot);
      const authorizedIds = new Set(snapshot.reports.map((report) => report.id));
      setPinned((previous) => previous.filter((id) => authorizedIds.has(id)));
      if (selectedId && !authorizedIds.has(selectedId)) setSelectedId(null);
    }
  }
  const bounds = useMemo(() => getTimeBounds(reports), [reports]);
  const cutoff = bounds && pct < 100 ? bounds.min + (bounds.max - bounds.min) * pct / 100 : null;
  const visible = useMemo(() => filterWorkspaceReports(reports, { hazard, query, sort, cutoff }), [reports, hazard, query, sort, cutoff]);
  const visibleIds = new Set(visible.map((report) => report.id));
  const pinnedReports = reports.filter((report) => pinned.includes(report.id)); const pinnedIds = new Set(pinnedReports.map((report) => report.id));
  const outsideFilterIds = new Set(pinnedReports.filter((report) => !visibleIds.has(report.id)).map((report) => report.id));
  const selected = visible.find((report) => report.id === selectedId) ?? null;
  const unlocatedCount = visible.filter((report) => !hasMapLocation(report)).length;
  const untimedCount = reports.filter((report) => !Number.isFinite(Date.parse(report.uploaded_at))).length;
  const hasFilters = hazard !== "all" || query.trim() !== "" || pct < 100;
  const selectReport = useCallback((id: string) => setSelectedId(id), []);
  function resetFilters() { setHazard("all"); setQuery(""); setPct(100); setSelectedId(null); setQueueLimit(5); }
  function togglePin(id: string) { setPinned((previous) => previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous.filter((entry) => reports.some((report) => report.id === entry)), id]); }
  function selectPinned(id: string) { if (!visibleIds.has(id)) { setHazard("all"); setQuery(""); setPct(100); } setSelectedId(id); }
  const fetchedAt = Number.isFinite(Date.parse(current.fetchedAt)) ? new Date(current.fetchedAt).toLocaleString() : "time unavailable";
  return <div className="grid min-w-0 max-w-full gap-4" data-testid="incident-command-workspace">
    <div className="flex min-w-0 flex-col gap-3 rounded-panel border border-rule bg-sheet p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1"><strong className="break-words text-sm [overflow-wrap:anywhere]">{reports.length} loaded{current.totalCount === null ? " · event total unavailable" : ` of ${current.totalCount} in this event`}</strong><p className="text-xs text-[var(--ink-3)]">Snapshot fetched {fetchedAt}. Filters and time range apply to this loaded window.</p></div>
      <button type="button" className={`${workspaceAction} w-full shrink-0 sm:w-auto`} onClick={() => startRefresh(() => router.refresh())} disabled={isRefreshing} aria-busy={isRefreshing}><RefreshCw size={16} aria-hidden="true" className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} />{isRefreshing ? "Refreshing…" : "Refresh reports"}</button>
    </div>
    {(snapshot.state !== "ready" || isStale) && <div className="grid gap-1 rounded-panel border border-[var(--amber)] bg-[var(--amber-wash)] p-4 text-[var(--amber-ink)]" role="alert"><strong>{isStale ? "Refresh failed · showing an older snapshot" : snapshot.state === "partial" ? "Some workspace data is unavailable" : "Workspace data unavailable"}</strong><p className="text-sm">{snapshot.message || "Try refreshing. An unavailable query is not an empty event."}</p></div>}
    <IncidentFilters reports={reports} hazard={hazard} query={query} sort={sort} onHazardChange={(value) => { setHazard(value); setSelectedId(null); setQueueLimit(5); }} onQueryChange={(value) => { setQuery(value); setSelectedId(null); setQueueLimit(5); }} onSortChange={setSort} />
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--ink-2)]" role="status" aria-live="polite">{visible.length} matching reports · {unlocatedCount} without a map location</p>{hasFilters && <button type="button" onClick={resetFilters} className={workspaceAction}>Reset filters</button>}</div>
    <div className="grid min-w-0 items-start gap-4 min-[1440px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]" data-testid="workspace-grid">
      <section className="grid min-w-0 gap-4" aria-label="Map and reported-time timeline">
        <div className="grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-3 sm:p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg">Incident map</h2><span className="text-xs text-[var(--ink-3)]">Select a pin or a queue card</span></div><DeferredGeoCanvas reports={visible} selectedId={selected?.id ?? null} onSelectReport={selectReport} />{unlocatedCount > 0 && <p className="flex items-start gap-2 text-sm text-[var(--ink-2)]"><MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{unlocatedCount} matching reports have unknown locations. They remain in the queue.</p>}</div>
        {bounds ? <TemporalScrubber reports={reports} visibleCount={visible.length} scrubberPct={pct} onChangePct={(value) => { setPct(value); setSelectedId(null); setQueueLimit(5); }} timeBounds={bounds} cutoffTimestamp={cutoff ?? bounds.max} /> : <div className="rounded-panel border border-rule bg-sheet p-4 text-sm text-[var(--ink-2)]">Reported-time timeline unavailable. No valid upload timestamps are loaded.</div>}
        {untimedCount > 0 && <p className="text-xs text-[var(--ink-3)]">{untimedCount} reports have an unavailable timestamp and are excluded when the timeline is narrowed.</p>}
        {visible.length === 0 && <div className="grid gap-3 rounded-panel border border-rule bg-sheet p-5"><h3>{reports.length ? "No incidents match these filters" : snapshot.state === "unavailable" ? "Reports could not be loaded" : "No reports in this event yet"}</h3><p className="text-sm text-[var(--ink-2)]">{reports.length ? "Clear the search, hazard, and reported-time filters to restore the loaded reports." : "Refresh the workspace or submit an authorized field report to begin."}</p><div className="flex flex-col gap-2 sm:flex-row">{hasFilters && <button type="button" className={workspaceAction} onClick={resetFilters}>Reset filters</button>}<Link href="/reports/new" className={workspaceAction}>Upload a report</Link></div></div>}
      </section>
      <aside className="grid min-w-0 gap-4" aria-label="Incident detail, priority queue, and pinned reports">
        <section className="grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-4" aria-label="Selected incident details"><h2 className="text-lg">Incident details</h2>{selected ? <IncidentEvidenceDetails key={selected.id} report={selected} summary={selected.summary} modelId={selected.model_id} canReview={canReview} pinned={pinnedIds.has(selected.id)} onPin={() => togglePin(selected.id)} /> : <p className="text-sm text-[var(--ink-2)]">Select a map pin or priority card to inspect evidence, location, and verification status.</p>}</section>
        <section className="grid min-w-0 gap-3 rounded-panel border border-rule bg-[var(--sheet-sunk)] p-4" aria-label="Priority queue"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Priority queue</h2><span className="font-mono text-xs text-[var(--ink-2)]">{visible.length} matching</span></div><p className="text-xs text-[var(--ink-3)]">{sort === "priority" ? "Highest available priority first. Unscored reports follow." : "Newest reported first."} AI priority remains provisional.</p><IncidentQueue reports={visible.slice(0, queueLimit)} selectedId={selected?.id ?? null} pinnedIds={pinnedIds} onSelect={selectReport} onTogglePin={togglePin} />{visible.length > queueLimit && <button type="button" className={`${workspaceAction} w-full`} onClick={() => setQueueLimit((value) => value + 5)}>Show more reports ({visible.length - queueLimit} remaining)</button>}{visible.length === 0 && <p className="text-sm text-[var(--ink-2)]">No reports to display.</p>}</section>
        <section className="grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-4" aria-label="Pinned reports"><h2 className="flex items-center gap-2 text-lg"><Pin size={18} aria-hidden="true" />Pinned reports <span className="text-sm text-[var(--ink-3)]">({pinnedReports.length})</span></h2><p className="text-xs text-[var(--ink-3)]">A local shortlist for this open workspace. Pins are cleared when you leave or switch event.</p>{pinnedReports.length ? <IncidentQueue reports={pinnedReports} selectedId={selected?.id ?? null} pinnedIds={pinnedIds} onSelect={selectPinned} onTogglePin={togglePin} outsideFilterIds={outsideFilterIds} pinned /> : <p className="text-sm text-[var(--ink-2)]">Pin a report from the queue or its details to keep it here.</p>}</section>
      </aside>
    </div>
  </div>;
}
