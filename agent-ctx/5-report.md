# Task 5 — Report components

## Files created
- `src/components/report/SeverityMeter.tsx` — `.severity[data-level][data-state]` with 5 segments; compact vs full
- `src/components/report/PriorityBreakdown.tsx` — 5-factor stacked bar with tooltips + legend + fixed caption
- `src/components/report/StatusTimeline.tsx` — 4-step pipeline (Uploaded → Checked → Analyzed → Waiting) with done/current/failed states
- `src/components/report/ReportThumb.tsx` — client component: fetches thumbnail signed URL per row; falls back to SealIcon placeholder
- `src/components/report/ReportRow.tsx` — `.report-row` horizontal layout (thumb + seal + title + severity + priority)
- `src/components/report/ReportCard.tsx` — vertical card variant for dashboard
- `src/components/report/ReportList.tsx` — fetches /api/reports, handles skeleton/empty/error states
- `src/components/report/index.ts` — re-exports

## Notes for next agents
- ReportList fetches with `include_analysis=true` by default so the incident_type from the AI observation populates the row.
- ReportRow uses SealBadge (compact) — for the table variant in the review queue, use the table directly with SealBadge.
- PriorityBreakdown expects factors as `{ name, value, weight, derivation, status? }` — the /api/reports/[id]/priority route returns `{ factors: FactorBreakdown[] }` with `{ name, maxPoints, points, status, explanation }`. The page adapter maps the API shape to the component shape (points → value, maxPoints → weight, explanation → derivation).
- StatusTimeline maps `needs_manual_review` to "step 2 done, step 3 current + failed"; `retryable_error` to "step 1 done, step 2 current + failed".
