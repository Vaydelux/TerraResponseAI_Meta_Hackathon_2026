"use client";

// src/components/map/HazardSummaryChart.tsx
//
// Summary sidebar card for the Incident Map page. Shows:
//   1. Total incidents, Pending review count, and Confirmed count.
//   2. A D3 bar chart (`import * as d3 from "d3"`) of Total Incidents
//      by Hazard Category (Flood, Fire, Medical, Structural, Blocked
//      Road, Debris, Other/Unclear) with interactive bar click filtering.

import { useMemo } from "react";
import * as d3 from "d3";
import { BarChart3 } from "lucide-react";
import { stateFromReport } from "@/lib/design/status";
import { resolveHazardCategory, type HazardCategoryId } from "./MapFilterBar";
import type { IncidentMapReport } from "./IncidentMap";

export interface HazardSummaryChartProps {
  reports: IncidentMapReport[];
  selectedHazards?: HazardCategoryId[];
  onToggleHazard?: (hazard: HazardCategoryId) => void;
  onResetHazards?: () => void;
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
  const chartWidth = 310;
  const labelWidth = 98;
  const valueWidth = 44;
  const barMaxWidth = chartWidth - labelWidth - valueWidth;
  const rowHeight = 25;
  const chartHeight = data.length * rowHeight + 8;

  const yScale = useMemo(
    () =>
      d3
        .scaleBand<string>()
        .domain(data.map((d) => d.key))
        .range([4, chartHeight - 4])
        .paddingInner(0.26),
    [data, chartHeight],
  );

  const maxTotal = useMemo(() => Math.max(1, d3.max(data, (d) => d.total) ?? 1), [data]);

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, maxTotal]).range([0, barMaxWidth]),
    [maxTotal, barMaxWidth],
  );

  return (
    <section className="panel" aria-labelledby="hazard-summary-heading" style={{ display: "grid", gap: "var(--s-3)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={16} aria-hidden="true" style={{ color: "var(--tide)" }} />
          <h3 id="hazard-summary-heading" style={{ fontSize: "var(--step-0)", margin: 0 }}>
            Incidents by Hazard Category
          </h3>
        </div>
        {selectedHazards.length > 0 && onResetHazards && (
          <button
            type="button"
            className="t-meta"
            onClick={onResetHazards}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--tide)",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Show all
          </button>
        )}
      </div>

      {/* Summary KPI Strip: Total, Pending Review, Confirmed */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-2)",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderRadius: "var(--r-ctl)",
            background: "var(--sheet-sunk)",
            border: "1px solid var(--rule)",
          }}
        >
          <div className="t-meta" style={{ fontSize: "0.72rem" }}>Total</div>
          <div className="num" style={{ fontFamily: "var(--font-display)", fontWeight: 750, fontSize: "var(--step-1)" }}>
            {totalCount}
          </div>
        </div>

        <div
          style={{
            padding: "8px 10px",
            borderRadius: "var(--r-ctl)",
            background: "var(--amber-wash)",
            border: "1px dashed var(--amber)",
          }}
        >
          <div className="t-meta" style={{ fontSize: "0.72rem", color: "var(--amber-ink)", fontWeight: 600 }}>
            Pending
          </div>
          <div
            className="num"
            data-testid="map-pending-count"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 750,
              fontSize: "var(--step-1)",
              color: "var(--amber-ink)",
            }}
          >
            {pendingCount}
          </div>
        </div>

        <div
          style={{
            padding: "8px 10px",
            borderRadius: "var(--r-ctl)",
            background: "var(--green-wash)",
            border: "1px solid var(--green)",
          }}
        >
          <div className="t-meta" style={{ fontSize: "0.72rem", color: "var(--green-ink)", fontWeight: 600 }}>
            Confirmed
          </div>
          <div
            className="num"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 750,
              fontSize: "var(--step-1)",
              color: "var(--green-ink)",
            }}
          >
            {confirmedCount}
          </div>
        </div>
      </div>

      {/* D3 SVG Bar Chart */}
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          role="img"
          aria-label="Bar chart of incidents by hazard category showing confirmed and pending counts"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="d3-grad-confirmed" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--tide)" />
              <stop offset="100%" stopColor="var(--tide)" />
            </linearGradient>
            <linearGradient id="d3-grad-pending" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--amber)" />
              <stop offset="100%" stopColor="var(--amber)" />
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
                style={{ cursor: d.selectable && onToggleHazard ? "pointer" : "default" }}
              >
                {/* Category Label */}
                <text
                  x={0}
                  y={bw / 2}
                  dy="0.35em"
                  fill={isSelected ? "var(--tide)" : "var(--ink-2)"}
                  fontSize={11.5}
                  fontWeight={isSelected ? 700 : 600}
                  fontFamily="var(--font-ui)"
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
                  fill="var(--sheet-sunk)"
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

                {/* Pending Bar Segment (Stacked after confirmed) */}
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
                  fill="var(--ink)"
                  fontSize={11.5}
                  fontWeight={700}
                  fontFamily="var(--font-ui)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.total}
                  {d.pending > 0 ? ` (${d.pending}p)` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend for the D3 stacked bars */}
      <div
        className="t-meta"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          fontSize: "0.75rem",
          paddingTop: 4,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--grad-primary)", display: "inline-block" }} />
            Confirmed
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--grad-amber)", display: "inline-block" }} />
            Pending (p)
          </span>
        </div>
        <span>Click a bar to toggle filter</span>
      </div>
    </section>
  );
}
