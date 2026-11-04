import { workspaceMapHeight } from "@/lib/workspace/presentation";

export default function Loading() {
  return <section className="mx-auto grid w-full min-w-0 max-w-[1440px] gap-4 px-3 py-6 sm:px-6" role="status" aria-label="Loading command workspace" aria-busy="true">
    <p className="text-sm font-semibold text-[var(--ink-2)]">Loading your incident workspace…</p>
    <div className="h-12 rounded-ctl bg-[var(--sheet-sunk)] motion-safe:animate-pulse" aria-hidden="true" />
    <div className="grid min-w-0 gap-4 min-[1440px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]" aria-hidden="true"><div className={`${workspaceMapHeight} rounded-panel border border-rule bg-[var(--sheet-sunk)] motion-safe:animate-pulse`} /><div className="grid content-start gap-4"><div className="h-48 rounded-panel border border-rule bg-[var(--sheet-sunk)] motion-safe:animate-pulse" /><div className="h-40 rounded-panel border border-rule bg-[var(--sheet-sunk)] motion-safe:animate-pulse" /></div></div>
  </section>;
}
