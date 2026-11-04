export interface MapLegendProps { className?: string; showPending?: boolean }

/** A normal-flow legend; verification meaning is never placed over the map image. */
export function MapLegend({ className = "", showPending = false }: MapLegendProps) {
  return <div className={`grid min-w-0 gap-2 rounded-panel border border-rule bg-sheet p-3 text-sm text-ink ${className}`} aria-label="Map legend">
    <div className="flex items-center gap-2"><span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-[var(--green)]" /><span>Confirmed by a human</span></div>
    {showPending && <div className="flex items-center gap-2"><span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-dashed border-[var(--amber-ink)] bg-[var(--amber-wash)]" /><span>AI generated, not verified</span></div>}
    <p className="text-xs text-[var(--ink-3)]">Ring weight represents provisional severity 1–5. Pin size is constant; it does not imply dispatch.</p>
  </div>;
}
