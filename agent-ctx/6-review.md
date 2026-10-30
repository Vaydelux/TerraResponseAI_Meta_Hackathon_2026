# Task 6 — Review components

## Files created
- `src/components/review/EvidenceList.tsx` — `.evidence-list` with check-style markers (color from parent data-state)
- `src/components/review/UncertaintyList.tsx` — `.well-uncertain` (same visual weight as EvidenceList)
- `src/components/review/MaskControl.tsx` — SAM control: target input + "Request mask" + streaming bar + opacity slider + toggle; `.mask-control[data-state=streaming|ready|idle|unavailable]`
- `src/components/review/EvidenceViewer.tsx` — `.viewer` with pan/zoom/mask; signed URL fetch on mount + visibilitychange + error (1s debounce); keyboard pan/zoom/fit/M; retention state 410 Gone branch
- `src/components/review/ObservationPanel.tsx` — `.obs panel[data-state]`; HatchSurface wraps only the Seal + heading + summary; sections in fixed order (Severity, Evidence, Uncertainties, Priority); actionBar slot
- `src/components/review/CorrectionForm.tsx` — native <dialog> drawer; pre-fills AI values; shows diff (`.diff__old` amber strike + `.diff__new` tide); submits action='comment' with corrections
- `src/components/review/ReviewActionBar.tsx` — sticky `.actions` bar; Confirm (C) / Correct (E) / Flag (F) / Reject (R); J/K next/previous; isOwnReport branch → `.actions__locked` with COPY.reviewerGuardSelf; on success sets resolving → toast → 640ms → router.replace(next)
- `src/components/review/ReviewWorkbench.tsx` — composes EvidenceViewer + ObservationPanel + (action bar) + StatusTimeline; fetches report + priority + segment + review history; readOnly prop for the report-detail page
- `src/components/review/index.ts` — re-exports

## Notes for next agents
- ReviewWorkbench fetches `/api/reports/[id]` + `/api/reports/[id]/priority` + `/api/reports/[id]/segment` + `/api/reports/[id]/review` (GET history) in parallel.
- The `nextReportId` prop drives J/K + the post-resolve navigation. The route layer should fetch the queue (status=needs_review, sorted by priority desc) and pass the next id.
- The `resolving` state drives the Seal's resolve animation (the `data-resolving="true"` attribute on `.seal`). The animation lasts --t-seal (640ms) — the post-resolve navigation waits exactly that long.
- The CorrectionForm uses `action: "comment"` per the existing review route schema (which accepts confirm/flag/reject/resolve/request_info + the corrected* fields). The "comment" action with corrected fields triggers the corrected state path in the API.
- The read-only report detail passes `readOnly={true}` so the action bar isn't rendered.
