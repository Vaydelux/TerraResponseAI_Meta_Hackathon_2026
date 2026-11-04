# TerraResponse AI — demo workspace improvement plan

Date: 2026-11-04 (Asia/Singapore)
Status: **Latest revision approved by the owner on 2026-11-04. Implementation and QA tracked in PR #64; see its exact-commit CI results for release readiness.**


> **LATEST-HEAD IMPLEMENTATION — 2026-11-04.** Owner explicitly approved execution in this conversation. This revision audits the original baseline `8fdcbc1a616dfec045b0b3b19543efc0022b71ac`; changes in PR #64 address its defects. Historical findings below describe an earlier implementation state and are not current defect claims. Supabase roles/schema/secrets remain untouched; do not infer live staging success from CI.

## Current audit & review plan for `8fdcbc1`

### 1. Findings — evidence on the latest commit

**Confirmed P0 release blocker:** GitHub Actions run [41845521118](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/actions/runs/41845521118) stopped at `bun run lint`: 3 errors (`ThemeToggle.tsx:75`, `GeoCanvas.tsx:74`, `IncidentMap.tsx:432`, all React's synchronous-effect state update rule) plus 2 warnings (`terra/reviewer-action-panel.tsx:116`, `ui/carousel.tsx:98`). **Typecheck, tests, and build were skipped**, not passed.

**Already implemented; preserve:**
- `dashboard/page.tsx` and `DashboardCommandWorkspace.tsx` present a real event-scoped snapshot, metrics, controlled hazard/search/sort and reported-time filters, map/queue selection, pin/unpin, clear-filter, and truthful stale/unavailable banners.
- `DashboardCommandWorkspace.tsx:61` defines `min-[1440px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]`; below 1440 it stacks. `workspace/presentation.ts:4` sets map height 320px at narrow mobile, 400px from 768px, 480px at 1025px, fluid 480–640px from 1440px.
- `IncidentFilters.tsx:35` uses horizontal-scrolling hazard pills; `workspaceAction` and the mobile menu generally enforce 44px controls.
- `IncidentEvidenceDetails.tsx:168-175` uses a solid, readable **AI generated, not verified** banner and explicitly says original-image authenticity was not assessed. Landing samples have explicit synthetic/demo labels.
- `load-snapshot.ts:12,116-154` scopes a 200-row maximum to the authorized event, distinguishes partial/unavailable/ready and does not invent missing coordinates. Keep its RLS/auth boundaries.

**Confirmed code-level weaknesses / verification gaps:**
- `DashboardCommandWorkspace.tsx:19-52` currently holds filtering, selected ID, saved-last snapshot, pins, pagination, and refresh in one component, with setState during render when `snapshot` changes (lines 28–37). This makes refresh/filter/selection interactions harder to reason about; keep the external component contract, but simplify internal state derivation without introducing a global state library.
- Map error handling exists, but fails the current React lint gate (`GeoCanvas.tsx:53-75`, `IncidentMap.tsx:414-433`). Map event listeners, tile errors, retry and stale selection need one consistent recoverable state model. The dashboard's modern `GeoCanvas` and older `IncidentMap` both compile in the repo; fix both without rewriting their feature sets.
- `WorkspaceLink.tsx:6` uses a native `<a>` to navigate inside the app; switch to `next/link` so the demo does not reload the app shell unnecessarily.
- Many dashboard/map components are written as dense single-line JSX, complicating safe accessibility fixes, but **do not** reformat unrelated files or replace the entire map library.
- The map/queue responsive classes are present, but no 320px/768px/1440px rendered screenshot or horizontal-overflow measurement is supplied by this audit. Do not claim overlap, text clipping, broken tablet layout, color-contrast failure, or a working live demo until measured.
- Existing tokens live in `src/app/styles/tokens.css`; `globals.css` has a Tailwind v4 token bridge and still imports legacy CSS layers. Honor the user's **utility-first flex/grid** goal for touched layouts, but avoid a destabilizing whole-app CSS rewrite during the hackathon.

### 2. Plan — ordered priorities (implement only after this delta is reviewed)

#### 1 — ENHANCE
- [ ] Make the 2–3 minute workflow easy to operate: landing CTA → authorized command workspace → hazard pill → time filter → map pin/queue card → details → pin/unpin → actual report/review destination.
- [ ] For an empty authorized account, offer a **clearly isolated, labeled sample-only walkthrough** *if required by demo setup*. Do not seed fake reports into Supabase or pass local simulated incidents off as live production data. Prefer the already implemented synthetic landing preview if sufficient.
- [ ] Keep one common selection/filter/pinned state for map and queue, with an obvious way to return from out-of-filter pinned reports to the selected report.

#### 2 — REFINE
- [ ] Simplify `DashboardCommandWorkspace` state transitions, including authorized-ID changes on refresh; keep the current component and prop contracts stable, dedupe only demonstrably repeated logic.
- [ ] Centralize hazard category lookup and workspace selection/filter helpers in existing `lib/workspace`; avoid inferring Hazmat/Medical from keywords when the stored incident type is `other`/`unclear`.
- [ ] Convert **touched** dashboard/map/landing layout rules to Tailwind flex/grid utility classes and reuse the existing semantic CSS variables. Do not remove shared stylesheet rules still used by other pages.
- [ ] Convert internal landing workspace CTA to `next/link`, preserving its active/focus styling.

#### 3 — POLISH
- [ ] Desktop **>=1440px**: stable 65% map+timeline / 35% details+queue+pins, with `min-w-0` and no clipped coordinate strings. Map height 480–640px.
- [ ] Tablet **768–1024px**: single column, map first at **400px**, timeline second, details/queue/pins below. Keep search/sort clear and uncramped.
- [ ] Mobile **320–480px**: single column, map at **320px**, horizontal hazard-pill scroller, snap-scrolling pinned cards, vertically stacked full-width CTAs; no full-document horizontal scroll.
- [ ] Use existing 4/8px space and typography tokens, 44px minimum touch targets, visible hover/focus/active/disabled states, scrims/solid text banners, `object-cover`/`object-contain` with intentional aspect ratios, and reduced-motion-safe movement.
- [ ] Confirm user-menu popup, long titles, long email, high-precision GPS and empty/error copy at all widths; no absolute-positioned **text** on critical card surfaces.

#### 4 — SOLIDIFY
- [ ] Fix the **three blocking lint errors** with correct React effect/event lifecycles, not global ESLint suppression or `setTimeout` band-aids. Resolve the two warnings where feasible.
- [ ] Make the map resilient to WebGL failures, blocked tiles, timeouts, resize/cleanup and repeated retries. The timeline/queue/details must remain accessible without the map.
- [ ] Keep RLS-scoped data loading; handle partial data, invalid timestamps, missing images, absent AI analysis, stale refresh and explicit unknown locations without fabricated values.
- [ ] Preserve the true AI/human verification distinction, avoid dispatch claims, and keep landing samples clearly fictional. Ensure every failure is visible or safely recoverable.
- [ ] Do not change Supabase schema, roles, environment secrets, auto-deploy settings, or incident-report lifecycle for this UI-focused pass.

#### 5 — TEST (only after phases 1–4)
- [ ] Run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, and relevant Playwright tests; save actual exit statuses and fix failures.
- [ ] Browser-check **320×800, 768×1024, 1440×900**, plus adjacent widths, portrait/landscape, long text, on-screen keyboard, motion reduction and day/night contrast. Assert `document.documentElement.scrollWidth <= window.innerWidth` for each view.
- [ ] Keyboard-run hazard selection, timeline, map pin selection, queue pin/unpin, report navigation, account menu and recovery links. Test missing-image and failed-map/network fallback.
- [ ] Rehearse one 2–3 minute flow and report whether it used **staging real data**, a **clearly labeled isolated mock**, or no authenticated account. Do not equate mock tests or a passing build with genuine Muse Spark/reviewer/production evidence.
- [ ] Only then propose merging a minimal reviewed PR; deployment requires user authorization per release scope.

### Target component tree

```text
LandingPage
  Hero / SyntheticSample / WorkspaceLink
  DemoFlow / MapPreview / MetaAIShowcase
Authenticated AppShell
  TopBar → UserMenu / ThemeToggle / nav
  DashboardPage → loadIncidentWorkspaceSnapshot (Supabase RLS)
    WorkspaceMetrics
    DashboardCommandWorkspace [one coherent local filter/selection state]
      IncidentFilters (horizontal pills, search, sort)
      Left: DeferredGeoCanvas → GeoCanvas + TemporalScrubber
      Right: IncidentEvidenceDetails + IncidentQueue + PinnedReports
  Review / Reports / Map pages (keep existing auth and data contracts)
```

### Design-token contract

Use `--paper`, `--sheet`, `--rule`, `--ink`, `--tide`, `--amber` (AI-unverified), `--green` (human-confirmed), `--brick` (rejected/critical), `--s-1..--s-8`, `--step--1..--step-4`, `--r-ctl`, `--r-panel`, `--focus`, and reduced-motion-safe transitions from `src/app/styles/tokens.css`. New touched layouts use Tailwind utility classes. No duplicate token palette.

### 3. Changes — implementation scope in PR #64

| Component / file | Targeted change |
| --- | --- |
| `ThemeToggle.tsx` | Replace sync effect state sync with a React-compliant subscription/initialization pattern; preserve system preference + localStorage behavior |
| `GeoCanvas.tsx`, `IncidentMap.tsx` | React-compliant failure transitions; lifecycle clean-up and explicit retryable map/tiles fallback |
| `DashboardCommandWorkspace.tsx` | Simplify snapshot refresh, selection/pin/filter state while preserving 65/35 layout and existing functional demo path |
| `IncidentFilters.tsx`, `IncidentQueue.tsx` | Tighten semantics and 44px/overflow responsiveness; no fake hazard classification |
| `IncidentEvidenceDetails.tsx`, `ReportThumb.tsx` | Preserve evidence provenance, missing-image fallback, long-text readability |
| `TopBar.tsx`, `UserMenu.tsx`, `WorkspaceLink.tsx` | Focus-safe menu, click targets, internal Next.js navigation |
| `Hero.tsx`, `MapPreview.tsx`, `MetaAIShowcase.tsx` | Preserve labeled synthetic examples; focus, contrast and responsive copy |
| `src/app/styles/*` + Tailwind classes | Token-aligned, targeted layout fixes; avoid wholesale stylesheet deletion |
| Tests + `docs/DEMO_SCRIPT.md` | Only in phase 5; browser/snapshot/failure/demo evidence |

### Implementation notes (as of approved patch)

- Fixed three original React effect-state lint errors: theme preference is an external subscription, and both MapLibre canvases own map initialization/teardown through the ref lifecycle.
- Improved map/context-loss recovery and retry while keeping the queue usable; adapted neutral map-marker title typing without loosening location validation.
- Preserved the 65/35 desktop split, tablet/mobile heights, RLS-scoped 200-report window and local pin logic. Added explicit selected-incident announcement and clear-selection action.
- Updated pending/manual-review labels to avoid claiming an AI observation exists before it is persisted.
- Kept actual landing synthetic samples; converted internal workspace links to Next.js Link; improved 44px carousel controls and eliminated synchronous Embla effect writes.
- Keyed legacy reviewer corrections by report+observation to prevent stale form fields and aborted stale review-history requests.
- Replaced the obsolete demo guide with the current, truthful 2½-minute UI walkthrough.
- Repaired Playwright's non-existent start script reference; added public responsive/keyboard smoke tests and a Chromium CI job after the core checks. This **does not** stand in for authenticated staging or actual live inference.
- Retired test assertions tightly coupled to removed fake dispatch and legacy UI mechanics; preserved or replaced them with tests for current truthful report/incident behavior.

### 4. Risks and verification limits

- Existing `main` **currently fails lint**, and latest CI never reached build, so do not treat previous commit success as proof for `8fdcbc1`.
- Rendering quality and mobile overflow are **unverified** until actual screenshots/measurements. The current code includes many good responsive constraints, not proof that every state works.
- Sample landing interaction is legitimate only with explicit **synthetic/demonstration** labels. A displayed sample must never become a live incident, confirmed report or agency dispatch.
- Report access must remain Supabase RLS-scoped. Never print credentials or expose service-role keys to a client.
- Vercel automatic deployments were previously enabled; **avoid any direct change to `main` until a green reviewed PR is ready**. This plan-only branch has no deployment effects on Production.
- Keep the 200-report loaded-window distinction vs event totals; do not call it a live all-incidents view.

### 5. Next step / review gate

**Owner review was received.** Phase 1–4 fixes and regression updates are committed on the isolated PR #64 branch. Merge only after exact-head lint, TypeScript, unit/integration, production build and responsive Chromium smoke checks pass. Authenticated staging/Meta/reviewer and manual visual rehearsal remain separate acceptance gates and must be reported as unverified if not actually run.

---


## Historical approved plan (preserved for reference)

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
