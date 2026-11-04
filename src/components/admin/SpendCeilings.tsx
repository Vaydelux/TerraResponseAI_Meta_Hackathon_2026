"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SpendCeilingsProps { className?: string }

interface UsageSummary {
  ok: true;
  day: string;
  summary: { totalCostUsd: number; totalRequests: number; byOutcome: Record<string, number> };
  ceilings: { dailySpendCeilingUsd: number; dailyRequestCeiling: number; perEventBudget: number; perUserAiCallsPerHour: number };
  caveat: string;
}
type UsageState = { state: "loading" } | { state: "error" } | { state: "ready"; payload: UsageSummary };

export function isUsableAiUsage(value: unknown): value is UsageSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<UsageSummary>;
  const summary = v.summary, ceilings = v.ceilings;
  return v.ok === true &&
    typeof v.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.day) &&
    !!summary && Number.isFinite(summary.totalCostUsd) && summary.totalCostUsd >= 0 &&
    Number.isInteger(summary.totalRequests) && summary.totalRequests >= 0 &&
    !!summary.byOutcome && typeof summary.byOutcome === "object" &&
    !!ceilings && Number.isFinite(ceilings.dailySpendCeilingUsd) &&
    Number.isFinite(ceilings.dailyRequestCeiling);
}

function UsageBar({ label, value, ceiling, unit }: { label: string; value: number; ceiling: number; unit: string }) {
  const enabled = ceiling > 0;
  const pct = enabled ? Math.min(100, Math.max(0, value / ceiling * 100)) : 0;
  const over = enabled && value > ceiling;
  return <div className="grid min-w-0 gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="text-sm tabular-nums text-[var(--ink-2)]">{value.toLocaleString(undefined, { maximumFractionDigits: unit === "USD" ? 4 : 0 })} {unit} / {enabled ? ceiling.toLocaleString() : "No configured ceiling"}</span>
    </div>
    <div className="h-3 overflow-hidden rounded-full border border-rule bg-[var(--sheet-sunk)]" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={enabled ? ceiling : 100} aria-valuenow={enabled ? Math.min(value, ceiling) : 0}
      aria-valuetext={enabled ? `${value} of ${ceiling} ${unit}` : "No configured ceiling"}>
      <div className={cn("h-full rounded-full motion-reduce:transition-none", over ? "bg-[var(--brick)]" : "bg-[var(--tide)]")}
        style={{ width: `${pct}%` }} />
    </div>
  </div>;
}

/** Only display truly global aggregates. Per-user/event numbers require a scoped query. */
export function SpendCeilings({ className }: SpendCeilingsProps) {
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [usage, setUsage] = useState<UsageState>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/admin/ai-usage", { signal: controller.signal, cache: "no-store" });
        const json: unknown = await response.json();
        if (!controller.signal.aborted) setUsage(response.ok && isUsableAiUsage(json) ? { state: "ready", payload: json } : { state: "error" });
      } catch {
        if (!controller.signal.aborted) setUsage({ state: "error" });
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [refreshIndex]);

  return <section className={cn("grid min-w-0 gap-4 rounded-panel border border-rule bg-sheet p-4 sm:p-5", className)} aria-labelledby="ai-cost-heading">
    <div className="grid min-w-0 gap-1">
      <h3 id="ai-cost-heading" className="m-0 text-lg font-semibold">Estimated AI usage and spend</h3>
      <p className="m-0 max-w-[75ch] break-words text-sm text-[var(--ink-2)]">
        Real recorded usage, not the provider invoice. This page never assumes that an unavailable query means $0.
      </p>
    </div>
    {usage.state === "loading" ? <p role="status" className="text-sm text-[var(--ink-2)]">Loading recorded AI usage…</p>
      : usage.state === "error" ?
        <div className="grid min-w-0 gap-2 rounded-ctl border border-[var(--amber)] bg-[var(--amber-wash)] p-4" role="alert">
          <p className="m-0 font-semibold">AI usage is unavailable</p>
          <p className="m-0 text-sm">No spend, request count or limit value has been inferred. Check the authenticated API and retry.</p>
          <button type="button" className="min-h-11 w-fit rounded-ctl border border-rule bg-sheet px-4 font-semibold hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)]"
            onClick={() => { setUsage({ state: "loading" }); setRefreshIndex(n => n + 1); }}>Retry loading</button>
        </div>
      : <div className="grid min-w-0 gap-4">
        <p className="m-0 text-sm text-[var(--ink-2)]">UTC day: <strong>{usage.payload.day}</strong></p>
        <UsageBar label="Global daily recorded estimate" value={usage.payload.summary.totalCostUsd}
          ceiling={usage.payload.ceilings.dailySpendCeilingUsd} unit="USD" />
        <UsageBar label="Global daily request records" value={usage.payload.summary.totalRequests}
          ceiling={usage.payload.ceilings.dailyRequestCeiling} unit="requests" />
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <p className="m-0 rounded-ctl border border-rule bg-[var(--sheet-sunk)] p-3 text-sm">
            <strong className="block text-base tabular-nums">{usage.payload.summary.totalRequests}</strong>
            Request records today (including failures and cache hits)
          </p>
          <p className="m-0 rounded-ctl border border-rule bg-[var(--sheet-sunk)] p-3 text-sm">
            <strong className="block text-base tabular-nums">${usage.payload.summary.totalCostUsd.toFixed(4)}</strong>
            Recorded estimate (historical calls may use older prices)
          </p>
        </div>
        <p className="m-0 text-sm text-[var(--ink-2)]">Per-user and per-event spend: unavailable in this aggregate; not inferred from global totals.</p>
        <p className="m-0 break-words text-xs leading-relaxed text-[var(--ink-3)]">{usage.payload.caveat}</p>
      </div>}
  </section>;
}
