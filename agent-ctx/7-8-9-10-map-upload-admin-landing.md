# Task 7-10 — Map, Upload, Admin, Landing

## Files created

### src/components/map/
- `MapLegend.tsx` — `.legend` with confirmed/pending rows + severity ring weight + size constant note
- `IncidentPin.tsx` — `.pin` button with `data-state` + `data-sev` + `aria-selected`
- `ClusterPin.tsx` — `.cluster` count pill
- `IncidentPanel.tsx` — `.map-panel` floating right with thumb + SealBadge + summary + open-review link
- `IncidentMap.tsx` — MapLibre GL JS shell with inline survey style; HTML markers (<300 reports) + `.map-toggle` segmented (Confirmed / Show pending) + viewport re-fetch (debounced 400ms)
- `index.ts` — re-exports

### src/components/upload/
- `FileCheckList.tsx` — `.filecheck` list with ok/fail/wait states (server-driven; never claims valid before server)
- `Dropzone.tsx` — `.dropzone` with `capture="environment"`; full-width "Take photo" + "Choose from library" (mobile order)
- `LocationConfirm.tsx` — three-way choice (GPS / manual / unknown) + lat/lon inputs for manual
- `UploadProgress.tsx` — `.upload-progress` bar (added CSS to globals.css)
- `UploadFlow.tsx` — three-step flow with `.steps` indicator; handles duplicate (409) + 410 success; uses COPY.postUpload
- `index.ts` — re-exports

### src/components/admin/
- `AuditLogTable.tsx` — `.table` of audit_events with relative + absolute time + action labels
- `AuditLogFilters.tsx` — client filter row using useFilterParam (URL search params)
- `EventManager.tsx` — `.table` of events (read-only in this demo build)
- `EvidencePurgeDialog.tsx` — native `<dialog>` requiring the report short ID typed to confirm (uses shortReportId + POST ?purge=1)
- `PriorityOverride.tsx` — form with newScore + reason (calls POST /priority)
- `SpendCeilings.tsx` — three gauges (per-user, per-event, daily) reading from /api/admin/ai-usage (polls every 60s)
- `index.ts` — re-exports

### src/components/landing/
- `Hero.tsx` — `.hero` with title (COPY.hero.title) + sub + CTAs + interactive `.hero__demo` (mini review workbench with working Confirm → resolve animation → "Confirmed by you")
- `TrustModelDiagram.tsx` — three lanes (upload → AI observes hatched → reviewer decides solid green)
- `BoundariesGrid.tsx` — 8 `.boundary` cards with varied corner shapes (CSS nth-child)
- `LiveFlowStrip.tsx` — 7 pipeline steps; the "Review" step is highlighted green ("Human" badge)
- `index.ts` — re-exports

## Notes for next agents (route wiring)
- The demo report ID for the Hero demo is the Asheville flooding report (REPORT_GPS in scripts/seed-demo.ts). The hero uses mock observation data inline (not fetching) so it renders without auth.
- AuditLogTable takes `events: AuditEvent[]` — the audit route page must fetch from the database (the audit_events table). There's no `/api/audit` route yet; the page reads via createSupabaseServerClient + RLS.
- EventManager is read-only in this build (no POST route for events); admin event CRUD is a roadmap item.
- The map page must pass `eventId` + the fetched reports to IncidentMap (the component handles viewport refetch).
- UploadFlow reads the active event from the `tr-active-event` cookie (set by EventSwitcher).
