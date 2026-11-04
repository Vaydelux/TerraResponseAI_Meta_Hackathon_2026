"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Tab = "audit" | "events" | "spend";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "audit", label: "Audit log" },
  { id: "events", label: "Events" },
  { id: "spend", label: "AI spend ceilings" },
];

/** One accessible tab panel at a time, with native roving keyboard focus. */
export function AdminTabs({ audit, events, spend }: { audit: ReactNode; events: ReactNode; spend: ReactNode }) {
  const [tab, setTab] = useState<Tab>("audit");
  const buttons = useRef<Record<Tab, HTMLButtonElement | null>>({ audit: null, events: null, spend: null });
  const panels: Record<Tab, ReactNode> = { audit, events, spend };

  function onKey(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    const currentIndex = TABS.findIndex((item) => item.id === current);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % TABS.length
      : event.key === "ArrowLeft" ? (currentIndex + TABS.length - 1) % TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    setTab(next);
    buttons.current[next]?.focus();
  }

  return <div className="grid min-w-0 gap-4">
    <div role="tablist" aria-label="Activity and governance sections"
      className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain rounded-panel border border-rule bg-[var(--sheet-sunk)] p-2">
      {TABS.map(({ id, label }) =>
        <button key={id} ref={(node) => { buttons.current[id] = node; }}
          id={`admin-tab-${id}`} type="button" role="tab" aria-selected={tab === id}
          aria-controls={`admin-panel-${id}`} tabIndex={tab === id ? 0 : -1}
          className={`min-h-11 shrink-0 rounded-ctl border px-4 text-sm font-semibold transition-colors hover:bg-sheet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none ${tab === id ? "border-[var(--tide)] bg-[var(--tide-wash)] text-tide" : "border-transparent text-[var(--ink-2)]"}`}
          onClick={() => setTab(id)} onKeyDown={(event) => onKey(event, id)}>
          {label}
        </button>)}
    </div>
    <section id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`}
      tabIndex={0} className="min-w-0 rounded-ctl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide">
      {panels[tab]}
    </section>
  </div>;
}
