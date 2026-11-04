# TerraResponse AI — demo workspace improvement plan

Date: 2026-11-04 (Asia/Singapore)
Status: **Approved by owner on 2026-11-04. Local implementation in progress on `feat/demo-command-workspace`.**

## 1. Findings

This is a source audit of the current clean checkout on `main`, not a rendered usability test. No tests, builds, preview servers, account creation, database mutations, commits, pushes, or deployments were run. Visual overlap and overflow still need browser verification in priority 5.

### Concrete problems

- **The requested dashboard composition is missing.** `src/components/report/DashboardCommandWorkspace.tsx:160` builds a feed and review-activity rail. The map and timeline exist separately in `src/components/map/IncidentMap.tsx`. The feed and photo grid also repeat the same reports (`DashboardCommandWorkspace.tsx:317` and `:602`). There is no real pin/unpin workflow; the map's “Pinned Reports” list is just its first eight sorted results (`IncidentMap.tsx:1192`).
- **Event and result scopes disagree.** `src/app/(app)/dashboard/page.tsx:37` ignores the active-event cookie and queries across memberships, while `src/app/(app)/map/page.tsx:24` honors the selected event. The dashboard loads only twelve reports but calls its feed “Real-time” and uses the total count for “Expand all” (`DashboardCommandWorkspace.tsx:182` and `:590`).
- **Operational claims are fabricated.** The dashboard hardcodes a 14-minute response time and a six-minute improvement (`dashboard/page.tsx:425`). `DetailsModal.tsx:132`, `IncidentPanel.tsx:95`, and `IncidentDetailsDialog.tsx:96` report successful agency dispatch after local state changes without a dispatch integration.
- **AI evidence and history are fabricated in detail surfaces.** `DetailsModal.tsx:112` substitutes priority 72; `:370` renders a fixed rectangle labeled as a SAM mask with 94.2% confidence; `:194`, `:206`, and `:240` invent stage times; `:644` supplies fixed hazard observations. `IncidentDetailsDialog.tsx:84` substitutes priority 65 and `:167` renders another illustrative mask as actual evidence. These must be removed from the demo path.
- **Missing data becomes a specific fictional incident.** `DashboardCommandWorkspace.tsx:324` substitutes disaster titles, a Pasig location, and flood/model observations for absent fields. `classifyHazard` also makes every severity-five incident Medical and defaults unknown hazards to Flood (`:54` and `:79`); the map has a different resolver.
- **Map layout violates the requested composition.** `IncidentMap.tsx:965` uses a fixed 380/410px rail instead of 65/35, and `:970` imposes a 580px minimum map height at every width. Detail text in `IncidentPanel.tsx:105` and the timeline in `TemporalScrubber.tsx` are absolutely docked into the same map area. GPS text is manually positioned and clipped in `src/app/styles/map.css:440`.
- **Map interaction has inconsistent state.** Filtering can leave an incident selected that is absent from the map/queue. Panning replaces the dataset (`IncidentMap.tsx:478`), which also changes timeline bounds (`:323`) and the queue without explaining the scope change.
- **Failure can look like success.** Dashboard/map queries discard error fields and default to zero/empty results. Map construction lacks a WebGL initialization fallback; viewport failures silently retain stale data (`IncidentMap.tsx:441` and `:475`). `ReportThumb.tsx:93` lacks image `onError` handling and does not reset image/failure state on report changes.
- **The account dropdown is structurally clipped.** `src/app/styles/components.css:1911` sets `.topbar { overflow: hidden }`, while `UserMenu.tsx:81` renders its popup inside the header. The header's nonshrinking brand plus long account name also creates narrow-width pressure.
- **Landing imagery has contradictory provenance.** `/demo/flood-aerial.png` is labeled AI-generated in `Hero.tsx:230`, “Verified Incident” in `MapPreview.tsx:174`, and “Raw Contributor Evidence” in `MetaAIShowcase.tsx:65`. The showcase hardcodes 89% confidence (`:125`). Image cards lack the exact requested banner consistently.
- **Landing preview interactions are incomplete.** `MapPreview.tsx:86` uses clickable-looking pin divs with no click/keyboard handler. “Watch 90-sec demo” links to static workflow cards (`FinalCTA.tsx:30`); the hero advertises a C shortcut without a handler (`Hero.tsx:353`).
- **Responsive roots need repair.** Hero confirmation controls do not wrap (`Hero.tsx:332`); captions, legends, and detail text are absolutely positioned in `Hero`, `MapPreview`, and `MetaAIShowcase`. Several landing headings use pale text on the light theme's paper surface. `src/app/page.tsx:40` hides horizontal overflow instead of resolving the constraints.
- **Some plain controls are too small.** Hazard pills explicitly use 34px height; mobile menu and account triggers use 40px and 36px. Existing shared shadcn buttons have a global height floor, so sizing must be checked per actual control rather than replaced indiscriminately.
- **Current test coverage is insufficient evidence.** Playwright targets 1280px and Pixel 5, not all required widths. Ordinary E2E chiefly covers unconfigured-backend states. The opt-in authenticated test performs key operations through APIs; it does not prove the full upload/review UI flow. Current truthfulness tests miss the detail-modal fabrications.

### Existing work to preserve

Keep the established TerraResponse branding, canonical logo, semantic verification colors, fluid type, four-pixel spacing tokens, role-aware navigation, server authorization, private evidence access, safe DOM marker creation, existing review workbench, and real report routes. Preserve lazy map loading, image aspect ratios, abort cleanup, focus styles, reduced-motion support, and the hero video's poster/save-data fallback.

## 2. Plan

### Highest-impact enhancement and scope

Build **one linked incident command workspace** on `/dashboard`: hazard/search/time filters produce one visible report set; map pins and queue cards select the same incident detail; users can explicitly pin/unpin reports into a local shortlist. This is the primary demo improvement. Replace duplicate feed/photo presentations with that workspace.

Keep the existing upload, real review, and report-detail destinations. Advanced map export, regional alert generation, new dispatch integrations, new auth flows, durable collaborative bookmarks, migrations, and unrelated admin changes are outside this pass. Remove unsupported claims from detail surfaces reachable through the demo. Do not add another public deployment or change the repository's hosting setup.

### Target layout per breakpoint

- **320–480px:** One column, 12–16px page gutters, compact brand/avatar navigation. Filters are horizontal scrollable pills with 44px minimum targets. A 320px-tall map is followed by its timeline as a separate flow block, then incident detail, priority cards, and pinned reports. Primary actions are full width; multi-action groups stack. Pinned cards may swipe inside a bounded snap-scrolling region. No page-level horizontal scrolling.
- **481–767px:** Same order and single-column structure, with a 360px map and wider gutters. Actions wrap naturally; no desktop table or fixed-width rail appears.
- **768–1024px:** Stack map above the sidebar content. The map viewport is exactly 400px tall; timeline and captions add their own height below it. Detail, queue, and pins remain normal-flow sections. Landing hero/preview stacks wherever a second column would constrain text.
- **1025–1439px:** Retain the stacked command layout with a 480px map. This explicitly resolves the unspecified intermediate range and avoids introducing a cramped rail before the requested desktop breakpoint.
- **1440px and wider:** Workspace uses `minmax(0,65fr) minmax(0,35fr)` after the gap. Left: map, status/legend, and temporal timeline in separate grid rows. Right: selected incident detail, priority queue, pinned reports. Map height is fluid within roughly 480–640px. Keep content within the existing 1440px maximum; no fixed-width sidebar or overlay text.
- **Landing at every width:** Preserve the brand and cinematic scrim. Use real grid/flex content blocks over/around decorative media, fixed media aspect ratios, semantic section surfaces, and stacked mobile footer CTAs. The illustrative map's detail card and legend sit beside/below it, not on top of its canvas.

Geographic marker positions and decorative image/canvas layers may be engine-positioned. Metrics, headings, coordinate strings, captions, legend text, timeline, and incident panels must remain in normal flex/grid flow. Menus/dialogs use an accessible positioning primitive rather than manually placed text.

### Proposed component tree

```text
LandingPage
  ResponsiveHeader / Wordmark / ThemeToggle
  Hero + clearly labeled local review simulation
  DemoFlow
  MapPreview (keyboard-selectable illustrative pins + flow detail card)
  Existing product/trust sections with consistent provenance
  FinalCTA

Authenticated AppShell
  TopBar + compact UserMenu (unclipped accessible popup)
  DemoBanner (only when explicitly enabled)
  DashboardPage (server auth, active event, data snapshot)
    WorkspaceHeader + truthful scoped metrics
    DashboardCommandWorkspace (canonical state owner)
      IncidentFilters (search, hazard pills, sort, refresh)
      WorkspaceGrid
        MapColumn
          MapStatus / ResultScope
          DeferredGeoCanvas -> GeoCanvas / local map error boundary
          MapLegend
          TemporalScrubber (controlled, in normal flow)
        IncidentRail
          SelectedIncidentDetails
            EvidenceCard / VerificationBanner / metadata / real review link
          PriorityQueue -> IncidentQueueCard
          PinnedReports -> same compact incident card primitive
      Existing report detail/workbench destinations
```

Reuse existing components and file locations where suitable. Extract narrowly scoped pieces instead of creating a parallel UI framework. Extract the map canvas/marker mechanics from the current implementation for controlled dashboard use; keep advanced `/map` capabilities available without expanding this pass into a wholesale map rewrite. Share pure formatting/classification helpers and relevant detail components across both surfaces.

### Data and interaction contract

- Introduce one typed `IncidentWorkspaceSnapshot` boundary for reports, event identity, scoped totals, fetched-at time, result-window metadata, and load state. A server-side loader uses the existing authenticated client and authorization rules. Do not use a privileged client to make the UI work.
- Resolve active event using the existing cookie only when it belongs to the signed-in user's memberships; use the same fallback as `/map`. Load at most 200 authorized reports for that event in deterministic priority/newest order. Include unlocated reports in the queue; only finite, in-range coordinates reach the map. Respect current role/status/retention visibility.
- Say “N loaded of X” when X is known. Counts, filter totals, and timeline explicitly describe the loaded window. Unknown/error totals display unavailable, never zero. An explicit Refresh updates the snapshot; panning does not silently replace it. Do not claim live synchronization.
- Keep selected ID, filter state, sort, cutoff, and pinned IDs in the workspace state owner. Map, queue, count, and histogram derive from the same selectors. Use explicit incident types; unknown remains Other/Unclassified. Severity never changes hazard category.
- Keep time bounds stable for the snapshot. Interpret the timeline as **uploaded/reported time**, not a fabricated incident-onset history. Skip invalid dates with a visible unavailable-time count; label the maximum as “All loaded reports,” not “Live.”
- If filters/time exclude the selected report, clear selection and offer a neutral “Select a visible incident” state. A filtered-out pinned report stays in the shortlist with an explicit “Outside current filters” label; selecting it resets the relevant filters/cutoff before showing it.
- Pins are **local to the open workspace**, not shared dispatch tasks. Label this behavior, reset on event change, and prune missing/unauthorized IDs on refresh. Never store private report content in local storage. Pin/unpin is an actual completed interaction.
- Separate genuine empty, filtered-empty, partial, unavailable, and stale states. Preserve a prior snapshot on refresh failure only with an explicit stale notice. Never silently swap production data for fixtures.
- Use fixture snapshots only for explicit development/test rehearsal and the already illustrative landing content through the same typed boundary. Do not bypass protected routes, create demo identities, seed the database, or label fixture observations as live inference.

### Tokens and styling

- Keep `src/app/styles/tokens.css` as the single source, exposed through the Tailwind v4 bridge in `src/app/globals.css`. Use utility-first Tailwind for touched demo layouts; remove replaced inline layout objects and competing legacy rules only where they are no longer used.
- Surfaces: `--paper`, `--sheet`, `--sheet-sunk`; ink: `--ink`, `--ink-2`, `--ink-3`; borders: `--rule`, `--rule-strong`.
- Actions: `--tide`, `--tide-hover`, `--tide-press`, `--on-tide`; brand coral remains a brand signal, never verification/severity.
- Verification: amber hatch plus **“AI generated, not verified”** for provisional AI content; green plus an actual human-confirmed status for reviewed records. On uploaded photos, attach the banner clearly to the AI observation rather than misrepresenting the photograph as synthetic. Synthetic landing images also retain explicit illustration/demo provenance even after a local simulated confirmation.
- Spacing: reuse 4/8/12/16/24/32/48/72px scale. Typography: reuse `--step-*`, existing display/UI/mono families, tabular metrics, and readable body/helper sizes. Break/wrap long IDs, coordinates, titles, names, and locations within `min-w-0` containers.
- Shape: reuse control/panel/pill radii and the existing modest elevation. Interaction targets: at least 44×44px on mobile. Motion: existing 120/180ms tokens for subtle feedback, with reduced-motion variants.
- Add bridge aliases only where necessary; do not introduce another hardcoded dark palette, replacement logo, new UI dependency, or a new styling system.

### Ordered implementation checklist — do not reorder

#### 1 — ENHANCE

- [ ] Replace the dashboard's duplicate feed/photo presentation with the linked map/timeline/detail/priority/pinned workflow.
- [ ] Establish the event-scoped snapshot interface and consistent filter/time/selection/pin semantics above.
- [ ] Make landing preview pins actually select illustrative incident details; provide a truthful landing-to-workspace CTA.
- [ ] Remove fake dispatch successes, decorative masks presented as actual SAM results, arbitrary confidence/priority/history, invented observations/locations, unsupported response-time KPIs, and false live/verified claims. Missing information stays explicitly unavailable. Real SAM remains available through the existing workbench only when backed by returned artifacts.
- [ ] Keep image cards' required banner and all fixture/provenance disclosures visible on the demo path.

#### 2 — REFINE

- [ ] Extract controlled map canvas, filter controls, evidence/status block, detail metadata, and compact queue/pinned cards with small typed props.
- [ ] Consolidate hazard classification, coordinate formatting, report normalization, and verification labels. Reuse `formatCoords` rather than hardcoding N/E for all coordinates.
- [ ] Move touched layout/presentation to Tailwind utilities backed by the existing tokens; remove duplicate rendering and only the superseded CSS/inline rules.
- [ ] Reuse shared detail/status components in reachable modal/map surfaces so fabricated fallback behavior cannot persist in an alternate path. Preserve real report and review routes.

#### 3 — POLISH

- [ ] Apply the five breakpoint layouts, 4/8px spacing rhythm, fluid type, bounded media, normal-flow captions/metrics, and compact navigation.
- [ ] Fix header/dropdown containment with a proper accessible popup; prevent long names from competing with the brand.
- [ ] Give every interactive control hover, visible keyboard focus, pressed/active, and disabled states; enlarge plain mobile targets to 44px minimum.
- [ ] Finish loading skeletons, selected/empty/unavailable presentations, pin feedback, and subtle reduced-motion-aware transitions.
- [ ] Use semantic theme tokens on landing sections; fix misleading demo/shortcut labels and stack full-width mobile actions.

#### 4 — SOLIDIFY

- [ ] Catch map constructor/WebGL/load errors locally; show a clear map-unavailable state with explicit retry while queue, timeline, and details stay usable. Distinguish tile/network loss from an empty incident set.
- [ ] Surface initial/partial/refresh data failures and stale timestamps. Abort obsolete requests, clean up map instances/listeners/timers, and guard event/selection races.
- [ ] Reset evidence state when report changes, handle signed-image fetch/decode failures, preserve aspect ratio, and provide a neutral retryable placeholder.
- [ ] Handle clipboard rejection honestly; validate finite/ranged coordinates, dates, optional analysis data, and nullable metrics at the snapshot boundary.
- [ ] Verify keyboard selection/menu/dialog behavior, accessible names and pressed states, status announcements, text contrast, reduced motion, and long-text resilience. Avoid nested clickable controls and focus loss on filtering.
- [ ] Resolve intrinsic width constraints with `min-w-0`, wrapping, and bounded internal scroll regions. Remove page-level overflow masking only after replacing its root causes.

#### 5 — TEST (only after 1–4)

- [ ] Run typecheck, production build, and relevant existing tests. Add a small set of meaningful behavior tests for shared filter/time/selection/pin state, unknown location/category, neutral missing data, and recoverable data/map/image failure.
- [ ] Extend browser smoke coverage to **320×800, 768×1024, and 1440×900**. Exercise landing → authorized workspace → filter → timeline → map/queue selection → pin/unpin → real report destination. Verify mobile profile menu and empty-filter recovery.
- [ ] Measure document overflow at every required width, inspect adjacent widths/long-content cases, confirm the tablet map is 400px and desktop split is 65/35, and check all demo controls' touch/focus/active states.
- [ ] Exercise keyboard-only navigation and reduced motion. Force unavailable map/tiles, failed refresh, missing AI, and expired/broken imagery; assert usable fallbacks instead of fabricated success.
- [ ] Rehearse the timed script below and update `docs/DEMO_SCRIPT.md` to match actual UI and existing authorized accounts. Do not recreate deleted demo users to satisfy stale instructions.
- [ ] Record commands/results, screenshots, actual rehearsal duration, and any skipped protected checks. A fixture smoke test does not prove live backend/AI behavior; report those separately.

### Proposed 2–3 minute demo

1. **0:00–0:20:** Show landing value proposition, synthetic-image disclosure, and human-review boundary. Open the workspace using an already authorized session.
2. **0:20–0:55:** Select Flood and scrub reported time. Show the matching queue/count/map changing together; return to all loaded reports.
3. **0:55–1:35:** Select a map pin, inspect the real evidence/available summary/provenance, then select a different queue card and show the same detail panel update.
4. **1:35–2:00:** Pin/unpin two reports, then inspect an unlocated report without inventing a map point.
5. **2:00–2:30:** Show provisional versus genuinely reviewed status, empty-filter recovery, and the usable map-unavailable fallback in the controlled rehearsal. A real review can use the existing workbench if an authorized reviewer session is available.

## 3. Changes proposed by component

- `dashboard/page.tsx`: active-event snapshot loader, truthful scoped metrics, error-aware data loading, workspace composition.
- `DashboardCommandWorkspace` and focused new child components: coordinated filters/timeline/map/selection, priority cards, actual local pins.
- Map canvas/timeline/detail components: controlled dashboard integration and flow layout; remove misleading shared detail behavior without rebuilding advanced map features.
- `ReportThumb`, image cards, and verification components: resilient image states and consistent observation/image provenance.
- `TopBar`, `UserMenu`, `AppShell`: unclipped menu, small-screen constraints, accessible controls, truthful footer labels where touched.
- Landing `Hero`, `MapPreview`, `MetaAIShowcase`, `DemoFlow`, `FinalCTA`: actionable preview, consistent sample labeling, token-based surfaces, flow captions and responsive actions.
- Tokens/Tailwind bridge and superseded styles: minimal shared aliases and cleanup for touched surfaces.
- Final-phase tests and `docs/DEMO_SCRIPT.md`: evidence for the requested demo and widths.

**Audit baseline:** the initial review changed only this `plan.md`. The owner subsequently approved local implementation; application changes are now in progress.

## 4. Risks and verification limits

- **Release gate:** The owner answered “Yes — completed and verified” to the required email confirmation/SMTP/demo-account deletion/role-security check on 2026-11-04. This is owner-reported, not independently tested here. GitHub issue #21 was read and remains open with its checklist unchanged. This plan does not authorize closing it, deploying, changing auth, or running migrations.
- **Public production:** `main` is connected to public Vercel production. Implementation should use an isolated local feature branch after review. No push/deployment is included in this plan.
- **Private data:** Preserve existing membership/RLS/retention rules and private signed-evidence endpoints. Increasing the loaded window from 12 to at most 200 must not broaden who can see which reports. Read current relevant Supabase docs before implementing loader changes; no schema or permission change is planned.
- **Map extraction:** `IncidentMap` mixes rendering, viewport requests, heatmap/export, and alerts. Extract only the controlled primitives needed for the dashboard; avoid a cascading rewrite of unrelated map tools.
- **Data scale:** The bounded window is an intentional demo limit. Exact event totals and loaded/filter counts must stay distinct. Larger-scale pagination/realtime is deferred and must not be implied by UI copy.
- **Fixtures and live rehearsal:** No credentials were read or requested. The final authenticated browser path requires access to an already authorized local/staging session and suitable permitted data. Missing access leaves live verification unproven; component fixtures cannot be reported as production proof.
- **Image provenance:** Synthetic sample imagery must remain labeled after a simulated confirmation. Human review of an observation is not proof of image authenticity. Genuine uploaded images should not be falsely labeled as generated photographs.
- **External dependencies:** Map tiles, signed URLs, and live AI may fail independently. Fallbacks must preserve the manual review/report workflow without claiming successful inference, segmentation, dispatch, or verification.
- **Existing coverage:** Current test success alone would not establish visual quality, real SMTP delivery, role isolation, private storage security, live inference, or compliance. No ISO/WCAG compliance or external audit claim will be made.

## 5. Next step

**Implement the approved plan in priority order, then verify the demo.** Owner review was received before implementation. No push, deployment, auth changes, migrations, or closure of issue #21 are authorized by this approval. The full improvement goal remains unfinished until the final checks pass.
