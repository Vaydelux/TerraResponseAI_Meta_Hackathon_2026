// src/components/map/HazardSummaryChart.tsx
//
// Summary sidebar card for the Incident Map page using shadcn & Lucide:
//   1. Total incidents, Pending review count, and Confirmed count.
//   2. A D3 bar chart of Total Incidents by Hazard Category with interactive
//      click-to-filter toggles and high-contrast accessibility.

"use client";

import { useMemo } from "react";
import * as d3 from "d3";
import { BarChart3, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { stateFromReport } from "@/lib/design/status";
import { resolveHazardCategory, type HazardCategoryId } from "./MapFilterBar";
import type { IncidentMapReport } from "./IncidentMap";
import { cn } from "@/lib/utils";

export interface HazardSummaryChartProps {
  reports: IncidentMapReport[];
  selectedHazards?: HazardCategoryId[];
  onToggleHazard?: (hazard: HazardCategoryId) => void;
  onResetHazards?: () => void;
  className?: string;
}

interface CategoryDatum {
  key: HazardCategoryId;
  label: string;
  total: number;
  pending: number;
  confirmed: number;
  selectable: boolean;
}

const CATEGORIES: Array<{
  key: HazardCategoryId;
  label: string;
  selectable: boolean;
}> = [
  { key: "flooding", label: "Flood", selectable: true },
  { key: "fire", label: "Fire & Hazmat", selectable: true },
  { key: "medical", label: "Medical", selectable: true },
  { key: "visible_structural_damage", label: "Structural", selectable: true },
  { key: "blocked_road", label: "Blocked Road", selectable: true },
  { key: "debris", label: "Debris", selectable: true },
  { key: "other", label: "Other / Unclear", selectable: false },
];

export function HazardSummaryChart({
  reports,
  selectedHazards = [],
  onToggleHazard,
  onResetHazards,
  className,
}: HazardSummaryChartProps) {
  const { data, totalCount, pendingCount, confirmedCount } = useMemo(() => {
    let pending = 0;
    let confirmed = 0;

    const counts: Record<HazardCategoryId, { total: number; pending: number; confirmed: number }> = {
      flooding: { total: 0, pending: 0, confirmed: 0 },
      fire: { total: 0, pending: 0, confirmed: 0 },
      medical: { total: 0, pending: 0, confirmed: 0 },
      visible_structural_damage: { total: 0, pending: 0, confirmed: 0 },
      blocked_road: { total: 0, pending: 0, confirmed: 0 },
      debris: { total: 0, pending: 0, confirmed: 0 },
      other: { total: 0, pending: 0, confirmed: 0 },
    };

    for (const r of reports) {
      const bucket = resolveHazardCategory(r);
      const st = stateFromReport({ status: r.status, reviewOutcome: r.review_outcome });
      const isConf = st === "confirmed" || st === "corrected";

      counts[bucket].total += 1;
      if (isConf) {
        counts[bucket].confirmed += 1;
        confirmed += 1;
      } else {
        counts[bucket].pending += 1;
        pending += 1;
      }
    }

    const rows: CategoryDatum[] = CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      selectable: c.selectable,
      total: counts[c.key].total,
      pending: counts[c.key].pending,
      confirmed: counts[c.key].confirmed,
    }));

    return {
      data: rows,
      totalCount: reports.length,
      pendingCount: pending,
      confirmedCount: confirmed,
    };
  }, [reports]);

  // Compute D3 scales for the horizontal bar chart
  const chartWidth = 320;
  const labelWidth = 100;
  const valueWidth = 46;
  const barMaxWidth = chartWidth - labelWidth - valueWidth;
  const rowHeight = 26;
  const chartHeight = data.length * rowHeight + 8;

  const yScale = useMemo(
    () =>
      d3
        .scaleBand<string>()
        .domain(data.map((d) => d.key))
        .range([4, chartHeight - 4])
        .paddingInner(0.24),
    [data, chartHeight],
  );

  const maxTotal = useMemo(() => Math.max(1, d3.max(data, (d) => d.total) ?? 1), [data]);

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, maxTotal]).range([0, barMaxWidth]),
    [maxTotal, barMaxWidth],
  );

  return (
    <Card
      className={cn(
        "bg-slate-950/95 dark:bg-[#0B141A]/95 border-slate-800 text-slate-100 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-col gap-3.5",
        className,
      )}
      aria-labelledby="hazard-summary-heading"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-teal-400" />
          <h3
            id="hazard-summary-heading"
            className="text-sm font-bold text-white tracking-tight"
          >
            Incidents by Hazard Category
          </h3>
        </div>
        {selectedHazards.length > 0 && onResetHazards && (
          <button
            type="button"
            onClick={onResetHazards}
            className="text-xs text-teal-400 hover:text-teal-300 font-semibold underline"
          >
            Show all
          </button>
        )}
      </div>

      {/* Summary KPI Strip: Total, Pending Review, Confirmed */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Total
          </div>
          <div className="text-lg font-extrabold text-white font-mono mt-0.5">
            {totalCount}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-600/50 text-center">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
            Pending
          </div>
          <div
            className="text-lg font-extrabold text-amber-400 font-mono mt-0.5"
            data-testid="map-pending-count"
          >
            {pendingCount}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-600/50 text-center">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            Confirmed
          </div>
          <div className="text-lg font-extrabold text-emerald-400 font-mono mt-0.5">
            {confirmedCount}
          </div>
        </div>
      </div>

      {/* D3 SVG Bar Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          role="img"
          aria-label="Bar chart of incidents by hazard category showing confirmed and pending counts"
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id="d3-grad-confirmed" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
            <linearGradient id="d3-grad-pending" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
          {data.map((d) => {
            const y = yScale(d.key) ?? 0;
            const bw = yScale.bandwidth();
            const confirmedW = xScale(d.confirmed);
            const pendingW = xScale(d.pending);
            const isSelected = selectedHazards.includes(d.key);

            return (
              <g
                key={d.key}
                transform={`translate(0, ${y})`}
                onClick={() => {
                  if (d.selectable && onToggleHazard) {
                    onToggleHazard(d.key);
                  }
                }}
                className={cn(
                  d.selectable && onToggleHazard
                    ? "cursor-pointer hover:opacity-85 transition-opacity"
                    : "cursor-default",
                )}
              >
                {/* Category Label */}
                <text
                  x={0}
                  y={bw / 2}
                  dy="0.35em"
                  fill={isSelected ? "#2dd4bf" : "#94a3b8"}
                  fontSize={11.5}
                  fontWeight={isSelected ? 700 : 500}
                  fontFamily="inherit"
                >
                  {d.label}
                </text>

                {/* Track Background */}
                <rect
                  x={labelWidth}
                  y={0}
                  width={barMaxWidth}
                  height={bw}
                  rx={4}
                  fill="#1e293b"
                />

                {/* Confirmed Bar Segment */}
                {confirmedW > 0 && (
                  <rect
                    x={labelWidth}
                    y={0}
                    width={Math.max(4, confirmedW)}
                    height={bw}
                    rx={4}
                    fill="url(#d3-grad-confirmed)"
                  >
                    <title>{`${d.label}: ${d.confirmed} confirmed`}</title>
                  </rect>
                )}

                {/* Pending Bar Segment */}
                {pendingW > 0 && (
                  <rect
                    x={labelWidth + confirmedW}
                    y={0}
                    width={Math.max(4, pendingW)}
                    height={bw}
                    rx={confirmedW > 0 ? 2 : 4}
                    fill="url(#d3-grad-pending)"
                  >
                    <title>{`${d.label}: ${d.pending} pending review`}</title>
                  </rect>
                )}

                {/* Numeric Total + Pending Readout */}
                <text
                  x={chartWidth - 2}
                  y={bw / 2}
                  dy="0.35em"
                  textAnchor="end"
                  fill="#f1f5f9"
                  fontSize={11.5}
                  fontWeight={700}
                  fontFamily="inherit"
                  className="font-mono"
                >
                  {d.total}
                  {d.pending > 0 ? ` (${d.pending}p)` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-teal-500 inline-block" />
            Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-amber-500 inline-block" />
            Pending (p)
          </span>
        </div>
        <span className="text-[10px] text-slate-400">Click a bar to toggle filter</span>
      </div>
    </Card>
  );
}
