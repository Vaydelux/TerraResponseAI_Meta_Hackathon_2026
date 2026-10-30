// src/components/admin/SpendCeilings.tsx
//
// Three horizontal gauges (per-user, per-event, daily) with the
// ceiling marked. Reads from /api/admin/ai-usage (the existing
// route). The gauge is a `.upload-progress__bar`-style track with a
// tide fill (under the ceiling) and an amber/brick marker if over.
//
// Client component — fetches the summary on mount + every 60s.

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SpendCeilingsProps {
  className?: string;
}

interface UsageSummary {
  ok?: boolean;
  summary?: {
    estimatedCostUsd?: number;
    requestCount?: number;
    byOutcome?: Record<string, number>;
  };
  ceilings?: {
    perUserDailyUsd?: number;
    perEventDailyUsd?: number;
    globalDailyUsd?: number;
  };
}

function Gauge({ label, value, ceiling, unit }: { label: string; value: number; ceiling: number; unit: string }) {
  const pct = ceiling > 0 ? Math.min(100, (value / ceiling) * 100) : 0;
  const over = value > ceiling;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="t-label">{label}</span>
        <span className="t-meta num">
          <span style={{ fontWeight: 700, color: over ? "var(--brick-ink)" : "var(--ink)" }}>
            {value.toFixed(2)}
          </span>{" "}
          / {ceiling.toFixed(2)} {unit}
        </span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 4,
          background: "var(--sheet-sunk)",
          border: "1px solid var(--rule)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: over ? "var(--brick)" : "var(--tide)",
            transition: "width var(--t-base) var(--ease-out)",
          }}
        />
        {over && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: "var(--brick-ink)",
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export function SpendCeilings({ className }: SpendCeilingsProps) {
  const [data, setData] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/ai-usage");
        const body = (await res.json()) as UsageSummary;
        if (!aborted) setData(body);
      } catch {
        if (!aborted) setData({ ok: false });
      }
    }
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      aborted = true;
      window.clearInterval(id);
    };
  }, []);

  const estimated = data?.summary?.estimatedCostUsd ?? 0;
  const requests = data?.summary?.requestCount ?? 0;
  const ceilings = data?.ceilings ?? {};
  const globalCeiling = ceilings.globalDailyUsd ?? 50;
  const perUser = ceilings.perUserDailyUsd ?? 5;
  const perEvent = ceilings.perEventDailyUsd ?? 25;

  return (
    <div className={cn("panel", className)} style={{ display: "grid", gap: "var(--s-4)" }}>
      <div>
        <h3 style={{ fontSize: "var(--step-1)" }}>Today&apos;s AI spend</h3>
        <p className="t-meta">
          The provider bill is the source of truth; this is an estimate for anomaly detection and budget enforcement only.
        </p>
      </div>
      <Gauge label="Per user" value={Math.min(perUser, estimated)} ceiling={perUser} unit="USD" />
      <Gauge label="Per event" value={Math.min(perEvent, estimated)} ceiling={perEvent} unit="USD" />
      <Gauge label="Daily global" value={estimated} ceiling={globalCeiling} unit="USD" />
      <div className="t-meta num">
        {requests.toLocaleString()} requests today · estimated cost ${estimated.toFixed(2)}
      </div>
    </div>
  );
}
