# ACTIVE PLAN — Fix SAM segmentation in manual-review workflow and render genuine masks

**Date:** 2026-11-05 Asia/Manila.
**Status:** OWNER APPROVED PROCEED — IMPLEMENTED ON PR #70; exact-head CI and live authenticated staging acceptance remain separate release gates.
**Baseline:** main \`9aab7016ea91b6e116bb418af1b3cb3522d465f1\`; PR #69 has merged with exact-head CI passing, but its production release remains blocked by Vercel 402 daily deployment quota. Public production still served \`3cf9f1d4\` at last inspection.
**Product:** TerraResponse AI, human-reviewed photo evidence and map-oriented incident triage, not an emergency dispatch service.
**Core demo:** Reporter uploads consented clearly labeled evidence; Muse Spark yields a provisional observation OR the report remains safe for manual review; independent reviewer optionally requests SAM when useful; real validated mask overlays the *correct photo pixels*; reviewer confirms/corrects/rejects; map displays appropriately reviewed report.
**Stack:** Next.js App Router, TypeScript, React, Tailwind/semantic CSS tokens, Supabase Auth/Postgres/RLS/private Storage, Meta Muse Spark Standard, Meta SAM 3.1 Responses API, MapLibre, Vercel.

## Implementation checkpoint — completed changes

The owner authorized proceeding with PR #70 and expanded the scope to reviewer Confirm, Correct, Flag, Reject, priority override, functionality and roles. Source changes implemented: role-aware review workbench, no failed-AI severity fabrication, human-correction provenance, permanent-error retry guards, SAM on manual-review with a reviewer-supplied target and no automatic inference, official Meta mask parser with genuine image-aligned canvas, atomic idempotent coordinator/admin priority transaction, tests and documentation.

**Staging DB gate:** `20261105001000_atomic_priority_override.sql` was applied to the staging project. Authenticated function execution is granted, anon execution rejected. No staging review or override records were modified as part of this migration. The production DB migration is intentionally **not** applied, so the code must NOT be marked production-ready without deploying it in production first.

**Known limitations:** no real paid SAM or authenticated review transaction was executed here; end-to-end user-account acceptance remains open; prior Vercel 402 quota may block production deployment. See `docs/REVIEW_ROLE_AND_SAM_QA_20261105.md` for exact role matrix, test scope and demo fallback.

## 1 — FINDINGS: verified concrete defects and staging conditions

1. **The screenshot reproduces a predictable state mismatch, not a transient segmentation timeout.** \`src/app/api/reports/[id]/segment/route.ts\` rejects all states except \`needs_review\` and \`reviewed\` with HTTP 409 \`INVALID_STATE\`. However \`ReviewWorkbench\` passes \`samAvailable\` based solely on API key configuration to \`EvidenceViewer\` / \`MaskControl\` even for \`needs_manual_review\`; \`MaskControl\` always offers Request mask and a Retry toast for errors other than 401/403. Retry repeats an unchanged status and cannot succeed.
2. **Staging read-only inspection:** two reports are \`needs_manual_review\` with failed analysis rows; one is \`needs_review\` with successful analysis; zero persisted SAM overlays. This confirms no actual mask was available in those examined rows and that existing evidence remains saved. Do not mutate these rows without explicit later acceptance-run approval.
3. **Actual mask parsing is incorrect.** \`src/lib/ai/sam.ts\` detects raw text by looking for \`<mask>\`, \`<box>\`, \`rle\`, or the word \`segmentation\`, but Meta SAM 3.1's documented wire grammar contains \`<|box;...|>\` and \`<|mask;...|>\` special tokens. A valid response can be wrongly classified as \`no_match\`. On apparent success, code stores raw special-token text under \`rle\`, invents \`score:1.0\`, leaves \`box:null\`, and assigns zero geometry; this is not a decoded mask. Official references: https://dev.meta.ai/docs/sam/reading-segmentation and https://dev.meta.ai/docs/sam/client-libraries.
4. **The evidence viewer currently fabricates a mask.** \`src/components/review/EvidenceViewer.tsx\` renders a fixed SVG rectangle x=20%, y=20%, 60% width/height for any saved overlay instead of actually decoding the model's mask; this violates the project's source-truth requirements and must be removed. It also renders from \`initialOverlay\` rather than the new \`onMask\` callback, so a freshly returned overlay is not reliably reflected in the viewer. The alternative \`src/components/terra/segmentation-overlay.tsx\` assumes whitespace RLE integer runs, also inconsistent with Meta's documented special-token grammar.
5. **The present backend's paid safeguards are useful and should be preserved.** SAM is opt-in and reviewer-gated with event membership, budget checks, existing-overlay reuse, cooldown, private derivative input, and a saved overlay under \`report_analyses.raw_usage_metadata._sam_overlay\`. It should never run silently during upload or due to a toast Retry. Zero matches is a legitimate result per Meta docs.
6. **Review itself is available for failed-analysis records.** The reviewer queue includes \`needs_manual_review\`, and the atomic-review API delegates to a permitted RLS-backed database function. A blocked SAM operation must not prevent the human reviewer from assessing the saved photo.

## 2 — PLAN in mandatory priority order

### 1. ENHANCE — user-visible demo path, truthful recovery
- [ ] Remove the false Request mask affordance for any status the backend will reject. Show the actual reason inline, not after a paid/failed request.
- [ ] Implement a deliberately separate, reviewer-only **Manual SAM assist** for a saved failed-analysis report in \`needs_manual_review\`, only after the reviewer supplies a concrete 2–100 character noun phrase and explicitly clicks Generate. SAM 3.1 supports concept segmentation without a prior Muse answer; this does NOT convert a failed Muse analysis into a valid one, mark the report reviewed, or bypass independent review. If the product owner prefers the earlier strict “valid Muse first” policy, retain the backend gate and show only Continue manual review / retry eligible analysis. **Default recommendation for the hackathon demo: allow explicit reviewer-guided SAM with the same capped paid safeguards** because it makes failed Muse gracefully recoverable without inventing an analysis.
- [ ] Preserve the distinct valid-analysis flow: \`needs_review\` / \`reviewed\` uses verified saved segmentation target when present or an explicit reviewer prompt. If no stored \`report_analyses\` row exists, show a clear non-billable unavailable state rather than create fabricated observations.
- [ ] Stop providing Retry for permanent 409 \`INVALID_STATE\`, auth denial, missing analysis, and invalid prompt; provide helpful next actions (Return to human review, refresh saved report, or request explicit manual assist where authorized).

### 2. REFINE — single real mask data contract, no needless dependencies
- [ ] Parse the real SAM stream through the officially documented \`@meta-sam/parser\` library (or a narrowly tested equivalent) including object IDs, geometry, masks and frame dimensions; do not treat unparsed text as an RLE mask.
- [ ] Introduce one typed \`SamMaskOverlay\` representing validated decoded mask data or a safe compact mask transport, true bounding boxes and source dimensions, plus prompt, model, optional reported confidence and AI-generated provenance. Never default confidence to 1.0 when absent.
- [ ] Reuse one mask renderer for \`EvidenceViewer\` (and retire/redirect the stale \`terra/segmentation-overlay.tsx\` implementation if unused). Both initial cached overlay and newly generated overlay use the same state and renderer.
- [ ] Store only authenticated, user-scope authorized artifacts, with current separate segmentation metadata on failed analysis rows. Preserve original observation, review status and audit history.

### 3. POLISH — resilient, theme-aligned review UX
- [ ] Disabled SAM state contains short copy: “Muse analysis unavailable. Review the evidence manually, or use optional reviewer-guided SAM with a specific target.” Distinguish API not configured from invalid report status.
- [ ] A clearly named \`Generate mask for "[target]"\` action, visible potential cost/opt-in, accessible progress, no-match and error states; show mask transparency and toggle only if REAL validated pixels exist.
- [ ] Use brand semantic tokens, 44px touch targets and responsive imagery. Mobile 320–480: photo then progress + target + stacked full-width action; Tablet 768–1024: photo first with 400px region; Desktop >=1440: review 65/35 evidence/observation within usable area; no horizontal overflow or clipped toast. Do not show extra decorative “X” controls unless semantically distinct error icon vs dismiss.
- [ ] Mask and box alignment must remain correct on object-contain image, zoom/pan, image rotation and resize; do not stretch an overlay into letterboxed padding. Keep the explicit banner “AI-generated region — not verified proof of damage.”

### 4. SOLIDIFY — permissions, privacy, costs and real-data guarantees
- [ ] API authorizes reviewer/admin and event membership (and excludes self-review where policy requires); manual-assist only in \`needs_manual_review\` with explicit prompt and existing private derivative; fail closed for unowned/stale/retained/purged evidence, bad dimensions, and missing saved analysis row.
- [ ] Keep SAM separate from Muse and review transitions; never turn \`needs_manual_review\` into \`needs_review\` merely because SAM returned geometry. A failed mask call does not delete evidence or inhibit the human's ReviewActionBar.
- [ ] Rate/cost check happens before each real SAM request, and duplicate exact-prompt results use cache. Enforce bounded stream payload/decoded raster size, sensible timeout/cooldown and no unauthenticated raw masks, model key or evidence URLs in error logs.
- [ ] Zero-match, malformed special tokens, missing dimensions and provider timeouts must display an honest empty/unavailable state; **never fabricate a rectangle, mask, box or confidence**.
- [ ] Existing Vercel deployment quota remains an independent blocker; do not move a preview to production if env sources differ.

### 5. TEST — only after stages 1–4
- [ ] Unit parser fixtures from Meta's documented SAM 3.1 wire grammar: valid mask(s), different object counts/IDs, scores absent, zero matches, malformed geometry, truncated stream and oversized mask.
- [ ] Component tests for \`needs_manual_review\`, \`needs_review\`, \`reviewed\`, missing config, 403/409, permanent error with no Retry, no-match with no image highlight, cached overlay, newly returned overlay, and correct image-mask alignment.
- [ ] API integration for manual-review explicit SAM (if approved), reviewer/admin/event guard, no-analysis, no derivative, rate ceiling, cache/cooldown, atomic metadata persistence and unchanged review state.
- [ ] Lint, typecheck, Vitest, production build and Playwright at 320/768/1440 with keyboard/reduced motion/touch; verify there are no masks/boxes generated on mock failure. Use a clearly labeled deterministic sample *only in isolated tests*.
- [ ] Stage one consented, authorized real SAM inference with a concrete target to validate decoded mask alignment and spending; only then include it in the 2–3 minute demonstration. Full project acceptance still requires two consecutive real reporter → Muse/known failure → independent reviewer → reviewed map demo runs.
- [ ] Update \`docs/DEMO_SCRIPT.md\` and known limitations with a short manual-review fallback. Do not claim accurate SAM masks without a real decoded model output.

## 3 — Target component tree

\`\`\`text
Authenticated ReviewWorkbench (report, actual processing state, current reviewer/event auth)
  ├── EvidenceViewer (private derivative, aspect-correct zoom & pan)
  │    ├── RealSamMaskCanvas (validated decoder output; never placeholder rectangle)
  │    └── MaskControl (status + allowed action, user-supplied concept, explicit opt-in)
  ├── ObservationPanel (Muse validated OR manual review required)
  ├── ReviewActionBar (independent human confirm/correct/flag/reject, always usable)
  └── StatusTimeline (truthful report + model state)
API /reports/[id]/segment
  ├── RLS/authz + state / analysis + prompt gate
  ├── replay/cache/budget/timeout guards
  ├── OfficialSamTextParser -> SamMaskOverlay
  └── authorized metadata artifact + usage audit, no report-state auto-transition
\`\`\`

**Tokens:** Reuse \`--paper\`, \`--sheet\`, \`--sheet-sunk\`, \`--ink\`, \`--ink-2\`, \`--ink-3\`, \`--tide\`, \`--on-tide\`, \`--rule\`, \`--amber\`, \`--brick\`, \`--s-*\`, \`--r-ctl\`, \`--r-panel\`; do not add one-off colors or gratuitous motion.

## 4 — Risks / limitations

- This screenshot alone does not prove the SAM API key or model is broken: the server rejected the call before it invoked the provider. Actual stream decoding has not been live-validated.
- Current rows include failed-analysis metadata but must not be modified as part of a plan-only PR. No production or staging writes, no AI provider calls, no deployment or secret changes in this plan.
- Optional manual SAM may incur charges. Meta advertises SAM 3.1 image segmentation at approx USD $2.50 / 1,000 images, excluding other provider costs; always verify actual billing. Source: https://dev.meta.ai/models/sam-3-1.
- Current code has mismatched raw output detection and fake visual geometry, so it is NOT safe to advertise a correct segmentation overlay yet.
- Preserving fallback human review is more important than making segmentation a mandatory step.

## 5 — Next action (owner approval gate)

**Approve this plan to implement reviewer-guided optional segmentation for \`needs_manual_review\`, fix the 409/Retry UX, and replace placeholder masks with parsed real SAM geometry.** Execute focused stages 1–4, run stage 5 CI, and merge only after exact-head checks pass. Report production deployment quota separately from the merge.

---

# Earlier plans (archived verbatim)

# ACTIVE PLAN — Fix empty Meta analysis response + replace schematic pin pad with real searchable map

**Date:** 2026-11-05 (Asia/Manila).
**Status:** APPROVED AND IMPLEMENTED ON PR #69; awaiting exact-head CI and separate live staging acceptance.
**Baseline:** \`main\` commit \`4042261727bde688616803738556eb946d7ed71c\`; PR #68 merged; Vercel production still on earlier commit \`3cf9f1d4\` due deployment API quota 402 at last verification.
**Product:** TerraResponse AI, disaster-photo triage with provisional Muse Spark observations and independent human review.
**Core 2–3-min demo:** Consented/synthetic photo → real geolocated pin → saved report → real provisional Muse analysis or truthful degraded state → independent reviewer → clearly labeled reviewed report on map.
**Stack:** Next.js App Router, TypeScript, Tailwind v4 + semantic CSS tokens, Supabase private evidence/Postgres/PostGIS/RLS, MapLibre GL JS and current shared \`buildSurveyStyle\`, Meta Muse Spark 1.3 Standard, Vercel.
**Devices:** 320–480px mobile, 768–1024px tablet, >=1440px desktop. Maintain 65/35 map/detail dashboard within available content width.

## Approved implementation checkpoint

Owner approved the plan and authorized merge/deploy after validation. Code implemented on this branch:
- Server-backed empty Meta-output diagnostics (finish reason, reasoning-token count, completion-token count, number of choices), with no raw response or evidence logged; low reasoning effort to improve chance of a visible structured output within the bounded budget.
- Explicit `MODEL_OUTPUT_LIMIT` retryable state for `finish_reason=length`; `MODEL_EMPTY_OUTPUT` goes to human review. No hidden automatic extra inference.
- The report timeline now explicitly distinguishes failed analysis from validated analysis and retains the photo and human review.
- Real MapLibre picker on upload with click/drag/keyboard pin, theme-aware real OSM tiles/attribution, independent numeric coordinates, EXIF GPS, browser permission GPS, and Unknown mode.
- Local latitude/longitude search without a key, optional signed-in MapTiler place-name search via server-only `MAPTILER_API_KEY`, result validation, timeout/debounce and best-effort request throttling. No report evidence or private descriptions are sent to the geocoder.
- Independent map-place search (a marker clearly labeled `not an incident`) alongside existing report search.
- Added API/data/unit tests and responsive CI gates.

**Operational limitations:** MapTiler search needs a MapTiler key in Vercel; coordinate lookup and manual map pinning do not. The static OSM basemap is a real map, but its tiles still require network and must comply with provider usage terms. The existing failed staging report was not re-analyzed and no new paid Meta calls were made; real cause of its empty response remains unknown without historic `finish_reason`. Protected two-pass staging acceptance is still unverified. Vercel account may be blocked by its deployment quota.

## 1. Audit findings (confirmed, do not treat hypotheses as facts)

### P0 — the user's reported failed analysis is NOT confirmed Zod validation failure
- Staging has a report submitted **2026-11-04 19:41:27 UTC**, whose report status is **\`needs_manual_review\`** and \`report_analyses.processing_status\` is **\`failed\`**. The persisted \`reports.last_error\` is exactly **\`Meta API returned an empty response.\`**. A separate earlier staging report has succeeded. Production was empty at the same read-only check.
- \`src/lib/ai/muse-spark.ts\` currently treats \`body.choices[0].message.content ?? ""\` as the only accepted content shape and **classifies empty content as permanent**. It has no safe diagnostic of \`finish_reason\`, content type, choices count, or \`usage.completion_tokens_details.reasoning_tokens\`. Therefore **we cannot yet establish why** the provider returned empty content (finish_reason \`length\`, refusal/content filter, alternative documented response shape, etc.).
- \`src/lib/ai/cost-controls.ts\` defaults to \`AI_MAX_OUTPUT_TOKENS=900\`; \`muse-spark.ts\` defaults to 900, clamps to 1200 and omits \`reasoning_effort\`. Official Meta documentation confirms reasoning tokens consume the output-token budget and that \`finish_reason='length'\` means a cap was hit. **Output-budget exhaustion is a hypothesis, not yet proven.** Changing limits or re-calling AI blindly wastes money and could degrade visual accuracy.
- \`src/app/api/reports/[id]/analyze/route.ts\` calls \`markAsManualReview\` and \`persistFailedAnalysis\` on a permanent result, recording a failed observation row. A saved photo is not lost; no automatic re-upload is warranted. Retry/manual-review handling must remain state-safe, cost bounded and idempotent.
- **Confirmed contradictory UI:** \`src/components/report/StatusTimeline.tsx\` renders \`Analyzed · failed\` but always uses the successful description \`AI observation produced, schema validated\`. On failure it should say **\`No usable AI observation was saved; manual review required\`**, not imply schema validation succeeded. The upload telemetry should show real \`NO_CONTENT\` / manual review vs \`SCHEMA_INVALID\`, with no raw provider detail or private images.

### P1 — the manual coordinate pad is schematic, not geographically accurate
- \`src/components/upload/LocationConfirm.tsx\` generates longitude/latitude from a **hard-coded Metro Manila rectangle** (lat 14.50–14.70, lon 120.95–121.15). The screenshot displays fictional water/road/sector overlays; clicking these is not identifying a real street or position.
- Hardcoded local \`SECTOR_PRESETS\` provide example locations that could accidentally be submitted as real evidence. The manual mode starts selected; it must not imply the location is verified until a deliberate confirmation.
- The project already uses **MapLibre GL JS** in \`src/components/map/IncidentMap.tsx\`, \`GeoCanvas.tsx\` and a shared theme-dependent style \`buildSurveyStyle\` (currently standard OSM raster tiles). Reuse this stack instead of loading Google Maps, another map SDK, or an additional heavyweight dependency.
- Existing \`LocationConfirm\` supports manual numeric latitude/longitude, optional actual EXIF GPS, permission-gated browser geolocation and \`unknown\` location. Keep every option and the current \`initialCoords\`, \`onDraftChange\`, \`onConfirm\` contract.
- Existing incident map \`searchQuery\` filters **reports**, not place names/addresses. Map location search must be visually separate from **Search reports**, never misrepresent a geocoder result as an independently verified disaster.

### P1 — provider and privacy constraints
- Real geocoding requires a supported data provider. Recommend an optional configurable **MapTiler Geocoding** adapter, subject to user-provided API key and quota; map clicks and numeric coordinate lookup must work without this key. Its official geocoding API supports forward/reverse search and MapLibre. The existing OSM basemap tiles may remain subject to OSM tile usage/attribution policy; evaluate an authorized configurable tile provider if needed.
- **Do not implement autocomplete against the public OSM Nominatim service:** the OSMF policy explicitly forbids autocomplete and imposes strict shared rate limits. No external service should receive private report text, images or user IDs. Send *only a user-entered place query* to the configured geocoder, with consent/clear disclosure where needed.
- Provider outages must not block coordinate entry, evidence upload (when location is unknown is permitted), or user-controlled manual pin placement on already loaded map tiles.

## 2. Ordered priorities (owner review gate applies)

### 1. ENHANCE — repair the core demo journey
- [ ] Correct \`StatusTimeline\` to derive per-step text from actual persisted status, never show schema validated for failed analysis. Include accessible status and helpful next step to review report.
- [ ] Add a narrow, secret-safe classification for **empty model content**: count choices, note validated \`finish_reason\`, available token counts/reasoning-token count, request ID and error category **only**; never log full prompts, response text, private image, bearer token, or signed storage URL.
- [ ] Keep \`SCHEMA_INVALID\`, \`MODEL_EMPTY_OUTPUT\`, provider HTTP failure, timeout, budget denied and database persist failure visibly distinct. If a report is already \`needs_manual_review\`, do not silently re-trigger paid analysis or auto-publish it.
- [ ] Replace \`LocationConfirm\` schematic pad with a **real MapLibre map picker**. Click to place a marker, drag it to refine, and receive exact \`event.lngLat.lat/lng\`. Numeric fields and pin remain synchronized. Keyboard-accessible default draggable marker (or explicitly implemented accessible custom element). Preserve explicit manual, EXIF GPS, browser GPS and Unknown flows.
- [ ] Add place/address search via optional geocoding, plus universally available **coordinate search** with no API key; move/fly to search results, require explicit **Use this location** confirmation before submitting.

### 2. REFINE — shared types, no unnecessary new services
- [ ] Extract \`LocationMapPicker\` (dynamic/client-only) under \`src/components/upload\`, using \`buildSurveyStyle\`, current theme resolver, \`MapLibre.NavigationControl\`, cleanup hooks, bounded default view rather than an invented user/report location, and one selected marker. Keep a single source of truth for \`{lat,lon}\` and geolocation source.
- [ ] Keep \`LocationConfirm\` small: coordinates/mode/search/confirm and privacy messaging. Remove fake road shapes, relative-pad projection and invented business/location examples from the live submission path (demo presets belong in clearly isolated fictional preview only).
- [ ] Introduce a typed search service boundary \`PlaceSearchAdapter\`: coordinate-string parsing works offline; optional \`/api/map/geocode\` proxy does server-side provider calls with allowlisted endpoint, input sanitization, geo bounds, response schema validation, timeouts and cost limits, minimal cached results. No extra AI calls.
- [ ] Reuse map style, theme and status tokens from existing design system. Do not refactor the large incident map beyond a shared search field and small hook where practical.
- [ ] Add a configurable, documented \`META_REASONING_EFFORT\` that defaults only after comparing structured-output validity. Prefer targeted modest \`low\` reasoning in triage if it measurably avoids empty output without misclassifying incidents; avoid a much higher token cap or uncontrolled retry.

### 3. POLISH — clarity on every device
- [ ] Mobile 320–480: one column, searchable field + results below, real map height ~300–360px, numeric coordinates below map, 44px targets, full-width confirm; no horizontal document scrolling or clipped geocoding results.
- [ ] Tablet 768–1024: map first, 400px viewport, search and coordinates below or alongside in available width; no overflow from geographic labels.
- [ ] Desktop >=1440: map and location detail side-by-side if useful (roughly 65/35 within remaining content); sticky primary submit only if it does not cover attribution/keyboard.
- [ ] Theme-aware map controls, brand colored selected marker, visible attribution, focus rings and hover/active states, reduced-motion camera, readable error/no-results/permission-denied states, 16:9 image fit unchanged.
- [ ] Optional place search can be scoped to \`/map\` via a separate tab/filter \`Places\` vs \`Reports\`, with provenance labels; no live-disaster claim for simple geocoder results.

### 4. SOLIDIFY — data quality, cost, failure recovery
- [ ] Preserve validated lat [-90,90], lon [-180,180], finite numbers and explicit user confirmation; never infer a selected location from current map center alone. Keep manual edits and pin synchronized when navigating steps backward/forward.
- [ ] MapLibre initialization/tiles/WebGL failure shows the manual lat/lon form with usable confirmation and optional \`unknown\`; keep available geocoding result selection if map fails.
- [ ] Geocoding proxy: 2–3 char minimum query, debounce 400–600 ms, AbortController cancel on edit, server rate limit and short query cache, strict URL allowlist, provider quota guard and timeouts. Avoid log storage of private user-typed data and guard against SSRF.
- [ ] Meta empty outputs: classify based on documented \`finish_reason\` where available; do not call absence of text a Zod violation. For \`length\` consider one deliberate, cost-guarded retry/low-reasoning request **in a new idempotent HTTP request only after QA**. No unbounded retries, no silent fallback invented analysis.
- [ ] Keep RLS, private storage, manual-review path and audit immutable. No production seed or migration unless approved separately.
- [ ] Check authorized map tiles/geocoding provider terms and configured key restrictions before production rollout.

### 5. TEST — after the implementation
- [ ] Vitest: successful structured output, empty content + \`finish_reason=length\`, empty content + \`stop\`, malformed JSON, schema invalid, provider HTTP failures, retry budget and status timeline copy.
- [ ] Location picker tests: map click -> coordinates, marker drag, search result -> marker, coordinate-only input, EXIF, browser GPS permission denied, unknown location, back/forward wizard preservation, geocoder unavailable and stale-result race.
- [ ] Next lint/typecheck/build + Playwright at **320 / 768 / 1440** and authenticated staging reporter flow. Test keyboard and touch, WebGL failure and no overflowing viewport. Verify search is not silently sending report data.
- [ ] Demo script: 0:00 intro, 0:30 real map and saved report, 1:00 model observation or labeled honest failure, 1:30 independent reviewer, 2:10 map pin and review status, 2:50 limitations.
- [ ] Full acceptance still requires two consecutive **real** staging Muse/reviewer/map passes; don't claim demo complete from mocked responses or screenshot inspection.
- [ ] Keep telemetry cheap and privacy-safe; compare provider output schema consistency and manual-review rate before deciding to alter reasoning budget.

## 3. Target component tree

\`\`\`text
ReportUploadFlow
 └─ LocationConfirm
     ├─ LocationModeTabs (manual, EXIF GPS, unknown)
     ├─ PlaceSearchField (coordinates always; optional provider search)
     │   └─ SearchResultList (select suggests, does not submit)
     ├─ LocationMapPicker (dynamic client MapLibre, shared theme style)
     │   ├─ real click/drag pin + map control + map attribution
     │   └─ NoWebGLFallback
     ├─ LatLonFields (single source of truth; strict validation)
     └─ UseThisLocation (explicit confirmation to Step 3)
ReportDetail / UploadProgress
 └─ StatusTimeline (truthful done/failed text, manual-review route)
Server
 ├─ analyzeImage / output-contract diagnostics (private)
 ├─ AnalysisHandler (existing bounded, idempotent DB state machine)
 └─ /api/map/geocode (optional provider; input validation/cache/rate limit)
IncidentMap
 ├─ SearchReports (current RLS-authorized report filters)
 └─ SearchPlaces (geocoding results; never incident proof)
\`\`\`

## 4. Existing tokens and scope

Use \`--paper\`, \`--sheet\`, \`--sheet-sunk\`, \`--ink\`, \`--ink-2\`, \`--ink-3\`, \`--rule\`, \`--tide\`, \`--tide-wash\`, \`--on-tide\`, \`--r-ctl\`, \`--r-panel\`, \`--s-2\`, \`--s-3\`, \`--s-4\`, \`--step-0\`, \`--step-1\`. Preserve reduced-motion and active day/night styles.

**No application code, Supabase data, paid Meta request, key setting or Vercel deployment is changed in this plan-only PR.**

## 5. Risks and approval gate

- Empty Meta response is confirmed; **cause of empty output is not yet known** because \`finish_reason\`/reasoning usage were not stored. No image-analysis bypass or fake schema compliance.
- Geocoder requires a configured provider and key; coordinate search + real map pin works without one. Provider-dependent search may incur external usage charges; no public Nominatim autocomplete.
- Real map tiles are network-dependent. Keep manual numeric lat/lon and \`Location unknown\` as first-class options.
- The screenshot may be from staging, where the relevant saved failure exists. Production DB contained no reports at the same read-only check; don't assume a production failure.
- Vercel account returned daily-deployment-quota HTTP 402 recently; a passing code review or merge does not imply the new features are actually deployed.

**NEXT STEP:** Owner reviews the proposed P0 truthful failure UI + Meta empty-output diagnostics, then MapLibre pin replacement + optional search. Upon approval, implement in a focused branch; run exact-head CI and separate real staging acceptance before claiming readiness.

---

# Earlier plans (preserved verbatim)

# ACTIVE PLAN — Calm global smooth scrolling (recording preparation)

**Date:** November 5, 2026 (Asia/Manila). **Status:** APPROVED, IMPLEMENTATION COMMITTED ON PR #68 — awaiting exact-commit CI and deployment.
**Baseline:** main \`3cf9f1d4d1b81c041c3b7cc8e2ae35f7f6687c9d\`. Latest merge (#67) is deployed and green.
**Product:** TerraResponse AI — photo-based community disaster reporting, provisional Meta observations and independently human-reviewed incident map.
**Core demo:** 2–3 minute capture of landing → authorized reporter upload → saved AI analysis → separate reviewer decision → accurately labeled map result.
**Stack:** Next.js App Router, React, TypeScript, Tailwind v4 with semantic CSS tokens, Supabase, Meta Muse Spark, MapLibre, Vercel.
**Scope:** Native, accessible *smooth anchor/programmatic page scrolling* on every public/authenticated route. Do NOT confuse this with full-page route transition animation, wheel/trackpad physics, forced scrolling of map gestures, or Javascript scroll hijacking.

## Approved enhancement — global “Back to top”

The owner approved the plan and explicitly added a responsive theme-aware Back-to-top button for every public and authenticated page. Implemented on the review branch:
- `src/components/layout/BackToTop.tsx` is mounted once in RootLayout. It appears only after meaningful document scrolling (not map/queue drag), uses a passive scroll listener with requestAnimationFrame throttling, and has no dependency on backend data or another animation library.
- A 48px branded floating control uses existing `--sheet`, `--tide`, `--on-tide`, `--rule-strong` and shadow tokens for day/night themes. Mobile remains compact; desktop shows the full label.
- Placement avoids bottom-right toast stacks by using the left edge on standard pages. The map/dashboard use a raised right-edge position to avoid map attribution; the review detail raises the control above the fixed mobile action bar. Backdrop overlay and drawer stay above the button.
- Clicking the control focuses `#main-content` and scrolls to document top. Reduced-motion preference uses native instant scrolling.
- `html` smooth anchor scrolling and sticky-header padding are centralized in `src/app/styles/base.css`; old duplicate landing `scroll-mt` offsets were removed.
- Vitest and responsive Playwright tests cover the new button, focus, hidden state, theme-class tokens, motion preference, anchor offset, touch target, and document overflow.
- Test/merge gate: run exact-head lint, typecheck, unit/integration, Next build, 320/768/1440 responsive browser smoke. Do not claim the protected authenticated two-pass staging E2E was performed by these tests.

## 1. Findings — concrete code audit

- \`src/app/globals.css\` imports \`styles/base.css\` and defines reduced-motion animation/transition rules but **does not define a root \`scroll-behavior\` or reduced-motion scroll override**.
- \`src/app/styles/base.css\` owns the \`html\` base selector, making it the appropriate single location to add root scroll behavior and offset tokens instead of patching every \`page.tsx\`.
- Public landing \`src/app/page.tsx\` has sticky top navigation and real \`#how-it-works\` / \`#incident-map-preview\` links. Abrupt anchor jumps and sticky-header obstruction should be checked. The global \`#main-content\` skip link must remain accessible and should not be delayed for reduced-motion users.
- Authenticated shell \`WorkspaceFrame\` has a sticky 64px navigation rail, an independent mobile drawer and body-scroll lock while the drawer is open. Internal sidebar scrolling must remain native; smooth root scrolling must not disrupt focus traps or overlay close.
- Interactive map, timeline, cards, queue overflow and horizontal filter pills include independent scroll/drag gestures. Do not apply \`scroll-behavior: smooth\` universally to \`*\`, \`body *\`, \`overflow-auto\`, or MapLibre's canvas; this would risk performance and perceived responsiveness.
- No supplied screenshot or recorded benchmark proves current wheel-scrolling is slow. Root CSS smooth behavior affects anchor links, \`scrollIntoView\`, and scroll APIs; it does **not** change OS/browser wheel acceleration. Avoid claiming otherwise.

## 2. Ordered implementation priorities (after review)

### 1 — ENHANCE
- [ ] Add one \`html\` root \`scroll-behavior: smooth\` under \`@media (prefers-reduced-motion: no-preference)\` for anchor and app-invoked page movement on *all* pages, including landing, login, reports, review, map and dashboard.
- [ ] Ensure anchor targets are not obscured by the sticky landing or authenticated header using root \`scroll-padding-top\`, drawing from existing \`--nav-h\` / spacing tokens rather than pixel magic.

### 2 — REFINE
- [ ] Centralize the rule in \`src/app/styles/base.css\`. Reuse existing \`--nav-h\` / \`--s-*\` tokens. Do not duplicate Tailwind \`scroll-smooth\` on each route.
- [ ] Preserve Next.js App Router default route scroll restoration rather than installing global transition listeners or a smooth scroll library.

### 3 — POLISH
- [ ] Apply consistent anchor offset across phone/tablet/desktop. Confirm the landing's section headings remain readable beneath its taller sticky header.
- [ ] Keep map, review queue, dialog, sidebar and hazard-pill native scrolling responsive; no long easing, forced wheel animation or scroll jank.
- [ ] Avoid altering layout, imagery, typography, buttons or current 65/35 desktop dashboard proportions for this isolated change.

### 4 — SOLIDIFY
- [ ] Respect \`prefers-reduced-motion: reduce\`: scrolling must be **instant** (override explicitly with \`scroll-behavior: auto !important\` if needed), while existing CSS/JS motion protections remain.
- [ ] Verify keyboard skip links move focus correctly, hash navigation does not hide headings behind the sticky header, no unintended horizontal body overflow, no focus trap conflict, and touch/mobile drawer scrolling is unchanged.
- [ ] Keep browser/OS wheel physics and MapLibre drag/zoom untouched. No Javascript wheel interception or animation loop.

### 5 — TEST (only after 1–4)
- [ ] Lint, typecheck, unit tests, Next production build and Playwright page smoke for 320 / 768 / 1440px, including a real landing hash-link click and return.
- [ ] In Playwright with \`reducedMotion: "no-preference"\`, assert computed \`document.documentElement\` scroll behavior is \`smooth\`; with \`reducedMotion: "reduce"\`, assert it is \`auto\`. Check sticky heading visibility, focus management and zero horizontal overflow.
- [ ] Verify signed-in navigation and map drag manually where automated credentials are unavailable; do not claim an authenticated acceptance run succeeded.
- [ ] For demo preparation, record the landing scroll, reporter/reviewer interface and map separately. Don't present fixture mode as live AI.

## 3. Layout target and component tree

| Breakpoint | Expected result |
| --- | --- |
| Mobile 320–480 | Native touch scroll, no hijacked momentum, section anchor below header; drawer scroll isolated and protected; no body overflow |
| Tablet 768–1024 | Smooth landing anchors, fixed/sticky header clearances, native map/pill/queue gestures |
| Desktop >=1440 | Sticky landing header and workspace sidebar unaffected, dashboard retains 65% map / 35% detail within content width, accessible page anchors |

\`\`\`text
RootLayout
  globals.css → styles/tokens.css → styles/base.css [one root smooth-scroll rule]
  PublicLanding → sticky header → #how-it-works / #incident-map-preview / #main-content
  Authenticated AppShell → WorkspaceFrame / TopBar / DesktopSidebar / MobileDrawer
     Dashboard / Reports / Review / IncidentMap [retain native nested scrolling]
\`\`\`

**Existing tokens:** \`--nav-h\`, \`--s-2\`, \`--s-3\`, \`--s-4\`, \`--paper\`, \`--sheet\`, \`--ink\`, \`--tide\`. No extra animation-duration token or new dependency required.

## 4. Risks and known limitations

- CSS \`scroll-behavior\` applies to anchor/programmatic movements, **not** inertial mouse-wheel/trackpad motion and not Next.js page-transition animations.
- A global \`scroll-smooth\` on every element may harm map dragging, large virtualized data sets, timeline gestures and form error focus. Not recommended.
- Root \`scroll-padding-top\` must account for real sticky header geometry; extra header content such as a banner can still vary, so capture a browser screenshot at target widths before claiming exact fit.
- Real authenticated staging two-pass demo remains unverified independently of this cosmetic enhancement. Existing auth/migration release issues still apply.

## 5. Next step — review gate

Approve this small root CSS and regression-test scope, then implement in a dedicated feature PR and merge only when exact-head CI passes. **No app code or production deployment is changed by this plan-only PR.**

---

# Previous plans (preserved verbatim)

# ACTIVE PLAN — TerraResponse AI full-app trust, UX, map, report and AI cost hardening

**Date:** 2026-11-05 Asia/Manila. **Status:** APPROVED and IMPLEMENTED on PR #67 branch; final CI and separate authenticated staging acceptance are required before full sign-off.
**Baseline:** main a12d68dcaf8977d24045f0cddb0927d7b572bad8 (PR #66 merged), Vercel READY on matching SHA.
**Product:** A human-reviewed disaster-photo triage prototype for reporters, reviewers and coordinators; not emergency dispatch.
**Demo:** In 2–3 minutes, reporter uploads a labeled test image and location; real Meta Muse Spark provides provisional observations; independent reviewer decides; authorized, human-reviewed map evidence appears with an audit record. A separate fictional sample tour is available if live dependencies fail.
**Stack:** Next.js App Router, React/TS, Tailwind + existing semantic CSS tokens, Supabase/Postgres/PostGIS/Auth/RLS/private storage, Muse Spark 1.3 Standard, optional SAM 3.1 and sourced contextual intelligence, Vercel.

## Implementation checkpoint (approval received)

The user authorized implementation of this plan. Code changes committed on this PR: truth-first incident/read-notification handling, official Standard-mode Muse prices, non-billable cache/preflight accounting, real global spend display and explicit unavailable state, mobile review cards, keyboard-accessible admin tabs, 44px filter/location touch targets, schematic-location disclosures and empty-map hardening. Regression tests and route-level audit added. Exact final-head CI must pass before merge; live staging E2E is still not observed and is not represented as passing. For detailed route-by-route assessment and known limits see docs/ROUTE_QUALITY_REVIEW_20261105.md.

## 1. Findings — source-audited defects, not speculative screenshots

**Critical: source truth and cost**
1. src/lib/ai/cost-controls.ts defaults to USD 0.30/million input tokens and 0.60/million output tokens; Meta's official Muse Spark Standard schedule is 1.25 and 4.25. Unless overridden, default estimated spend can understate actual rate-based cost by ~4.2x on input and ~7.1x on output. The provider bill remains authoritative.
2. src/components/admin/SpendCeilings.tsx displays the SAME global estimated usage as per-user and per-event, capped to those limits. This is not genuine scoped spending. Its fallback ceilings and default zeros mask API outages as measured data.
3. src/app/(app)/incidents/page.tsx derives fallback incident groups from real reports, but missing AI classification defaults to flooding and grouping uses event + hazard (not measured distance or recency). It can imply unproven hazard, location and incident grouping.
4. src/app/(app)/notifications/page.tsx fabricates an unread-inbox count from derived report activity when notifications query fails or returns empty. Derived read-only activity is not a persisted notification or unread event; present it separately or show failure.
5. src/app/(app)/audit/page.tsx sometimes discards Supabase audit read errors. src/app/api/reports/[id]/analyze/route.ts uses a constant severity uncertainty (0.3), not a calibrated model-measured uncertainty; it must never be advertised as exact confidence.
6. The landing fictional map is intentionally static and already marked fictional; static navigation labels, safety thresholds, model prompts and category definitions are legitimate constants. They must not be confused with invented incident evidence. Production data currently has no reports, analyses or reviews; staging has 1 report, 1 successful Muse analysis and zero reviewer actions.

**High: mobile and interaction**
7. ReviewQueueTable has seven columns and uses native Table without a mobile stacked-card representation. The table CSS uses width:100% and overflow:hidden, which does not prove no overflow or readable touch targets at 320px. Audit admin, audit-log and event tables too.
8. FilterRail reset control is 26px high; LocationConfirm quick-sector presets and edit control are 28px high, below requested 44px touch targets. Some legacy control CSS differs from recent Tailwind additions.
9. The 264px/76px desktop sidebar reduces usable width before the dashboard 65/35 split. Verify nested breakpoints 1024/1280/1440 and expanded/collapsed states, not just public viewport width.
10. The dashboard's command map and dedicated incident map are two implementations; preserve consistent verified/pending status, event scope and tile failure behavior. Review CPU/markers/heatmap/reduced motion. The synthetic sector placement grid is a manually selected approximate location control, NOT independently verified GPS.
11. Audit AdminTabs uses a pressed-button segmented group rather than proper tablist/panel semantics. Events content is read-only, so all edit/create affordances must accurately reflect that. Verify each tab actually shows meaningful results and clear unavailable/empty states.
12. Ordinary PR #66 CI passed, including 9 public-browser responsive tests, but the complete authenticated role-specific desktop/mobile paths and two live staging demos were NOT observed passing. Global mobile→desktop readiness cannot yet be certified.

**Existing foundations worth keeping**
- Real RLS-gated snapshots; authentic saved Meta observations remain provisional; separate human-review action; original photo authenticity not guaranteed.
- SHA256 duplicate caching, bounded Muse requests/output, rate/spend ceilings, Zod schema validation, timeout and retry caps, controlled offline uploads, private evidence, protected review RPC.
- Isolated fictional landing MapPreview clearly says samples are fictional; new human-confirmed map index stays available when WebGL fails.
- Role-aware collapsible sidebar and mobile drawer with focus handling; no need to redesign navigation wholesale.

## 2. Ordered priorities — IMPLEMENT ONLY AFTER OWNER REVIEW

### 1 ENHANCE — high impact truthful demo
- [ ] Fix false flooding fallback and mark unpersisted report clusters as PROVISIONAL DERIVED GROUPS, never persisted incidents. A real 5–10 km/recency claim must be based on measured geodesic distance, time and source records; unknown classification stays unknown.
- [ ] Separate persisted Notifications inbox/unread count from read-only report activity; failure does not become an invented empty state or unread alert.
- [ ] On report submission and review success, show one clear next action; on model failure preserve the saved report and allow authorized human review with truthful provenance. Keep all synthetic demo data clearly marked, never merge into live data.
- [ ] Make all interactive tabs and visible actions truthful; remove dead or misleading controls before adding features.

### 2 REFINE — precise low-cost AI and shared design
- [ ] Update Muse Spark Standard price defaults, cite provider schedule and date; allow explicit env overrides. Show estimated token rates and token usage only as estimates; use real scoped SQL/API per-user/per-event numbers where authorized, otherwise Unavailable.
- [ ] Keep Muse Spark 1.3 Standard mode for private photos, not Contributor without explicit opt-in/privacy review. No Muse Wonder or generated imagery for ordinary triage.
- [ ] Reuse one bounded schema-constrained Muse vision call per persisted image, SHA/prompt/schema cache, EXIF-stripped derivative, retry caps and rate limits. Compare 900 vs 700 vs 600 output tokens against real representative fixture quality before changing defaults; no silent accuracy regression.
- [ ] SAM only when an authorized reviewer explicitly requests a concrete segmentation region and cost allows; optional contextual weather only with timestamp, location, genuine external citations and explicit stale/unavailable fallback. Never invent weather advisories.
- [ ] Extract shared status/provenance, mobile data cards, error/empty/loading and navigation tokens only where duplication is measurable.

### 3 POLISH — page-by-page visual and interaction checklist
- [ ] Public landing: readable hero and scrim, media poster fallback, fictional sample label, working CTAs.
- [ ] Login, signup, forgot/reset password, account unavailable: readable forms, accessible validation, realistic authentication/verification states, no broken branding.
- [ ] Dashboard: true metric source scope, 65/35 inside usable desktop width, map/timeline/queue/pinned list, responsive overflow and sidebar collapse.
- [ ] Map: actual map vs split tabs, hazard pills, severity filters, heatmap derived density labeling, marker focus, confirmed index, WebGL/network fallback.
- [ ] Reports list/grid: actual filters and counts, responsive cards, search, large text, private thumbnail fallback, pagination/loaded-window wording.
- [ ] Upload: photo/location/submit, explicit manual coordinates, no invented GPS, >44px targets, offline draft and duplicate protection.
- [ ] Report detail: audit and evidence clarity, private media recovery, uploaded/AI/review provenance, deletion safeguards and long text.
- [ ] Review queue/workbench: table desktop + stacked mobile cards, readable statuses, Confirm/Correct/Flag/Reject, shortcut/keyboard behavior, optional SAM, no self-review.
- [ ] Incident threads/detail: true sourced thread grouping, accurate status, valid linked report count, no invented hazard or location.
- [ ] Notifications: real inbox vs derived activity, accurate unread and read actions, date/status with no fabricated data.
- [ ] Profile: real role/permissions and own reports; disabled or unimplemented actions clearly indicated.
- [ ] Audit tabs (log, events, spend): semantic tabs, focus/arrow-key support, audited events from RLS data, read-only events, correct scoped AI spend or unavailable.
- [ ] Admin users: actual role grants, read-only/error states, responsive accounts and 44px controls.
- [ ] Navigation: role visibility, active and collapsed state, focus trap, Escape, icon tooltips and stable mobile drawer.

**Breakpoints:** 320–480: single column, swipeable cards and scrollable hazard pills within containers, stacked full-width buttons, >=44px tap targets, 16:9 object-cover previews, no document overflow. 768–1024: modal drawer, map 400px and stacked queue. >=1440: desktop rail collapsed/expanded, map/timeline 65%, queue/detail 35% of remaining content. Also test intermediate 1024/1280 and mobile keyboard state. Accessibility: AA contrast, keyboard, aria, reduced motion, empty/loading/error and long untrusted text.

**Tokens:** Preserve --paper, --sheet, --sheet-sunk, --ink, --ink-2, --ink-3, --rule, --tide, --amber, --green, --brick, --s-*, --step-*, --r-ctl, --r-panel; remove arbitrary one-off colors where touched.

## 3. Target component tree
Authenticated AppShell
  WorkspaceFrame → compact TopBar / grouped collapsible Sidebar / MobileDialog
  DashboardCommandWorkspace → IncidentFilters + GeoCanvas/Timeline + Queue/Details
  MapPage → IncidentMap + VerifiedMapIndex (same authorized snapshot)
  Reports → ResponsiveReportList + ReportDetail + private ReportThumb
  UploadFlow → saved report → Muse provisional analysis → reviewer queue
  ReviewQueue → desktop Table / mobile Cards → ReviewWorkbench / ReviewActions / optional SAM
  IncidentThreads → persisted thread OR explicitly labeled derived grouping
  Notifications → persisted Inbox + separate sourced ReportActivityHistory
  AuditTabs → AuditLog / ReadOnlyEvents / TrueScopedCostDashboard
Landing → clearly fictional MapPreview, independent of live reports

## 4. SOLIDIFY — security, data integrity and failures
- [ ] Confirm all roles and route handlers obey RLS and ownership; authenticated does not imply authorized, private photos never publicly exposed and no service keys reach browser.
- [ ] Reviewer approval refers to recorded decision, NOT guaranteed image authenticity or emergency dispatch; no AI-only confirmed pins. Unknown coordinates never placed on map.
- [ ] Avoid duplicate paid model calls, preserve data on upload/network/model failures; report strict meaningful session expiry, status transitions and retryable errors.
- [ ] Distinguish real persisted report, derived-from-report card, and fictional sample in UI. Audit event-scoped status and batch query errors fail closed.
- [ ] Audit map clustering CPU/DOM size and tile failures; retained queue should work on 32-bit/low-memory mobile devices. Use measured data, not invented performance claims.
- [ ] Keyboard, visible focus, reduced motion, route-active sidebar, meaningful labels, correct responsive table/card transformations and no body horizontal scroll.

## 5. TEST LAST — execution/acceptance
- [ ] After implementing priorities 1–4, lint, typecheck, unit+integration tests, Next production build and Playwright in 320/480/768/1024/1280/1440; check all role tabs and each visible control, overflow and contrast.
- [ ] Validate role-specific reporter/reviewer/admin paths, account changes, persistence, database RLS and real-error injection.
- [ ] Protected staging E2E must succeed twice in a row with real model calls, distinct reviewer, audit history and map status; verify visual map marker separately. No protected run has been observed yet.
- [ ] One-paragraph 2–3 minute demo script + known limitations. Do not call fully tested/enterprise ready until all checks pass.
- [ ] Open release issues #21 (email confirmation) and #30 (staging migration ledger) remain independent gates.

## 6. Risks and next action
Priority risks: (1) misleading hazard/unread/spend data, (2) private evidence and model costs, (3) authenticated 320px usability untested, (4) map CPU/tiles, (5) incomplete live review. PR #66 is already merged; this new PR contains ONLY a reviewed action plan.
**Owner review gate:** Approve this plan before application code edits. First implementation PR: honest incident/notification/spend data + correct Muse Standard pricing. Then responsive review tables and map/report polish, then staged E2E and visual review.

---

# Earlier plans (archived verbatim)

# ACTIVE PLAN — TerraResponse AI two-pass hackathon demo readiness

**Date:** November 5, 2026 (Asia/Manila). **State:** AWAITING OWNER REVIEW — PLAN ONLY.
**Baseline:** main commit ac6713141d6aefa70d05a2bb3c641f4bca71bff4, post-merge GitHub CI run 41875117439 succeeded, Vercel production deployment dpl_CBgT2jiZA5LsE5u96NGL5A2DKrYb READY.
**Product:** Human-reviewed disaster-photo incident intelligence prototype for community reporters and authorized reviewers. Not emergency dispatch.
**Core 2–3 minute demo:** Reporter saves a consented or clearly synthetic disaster photo and its real location; Meta Muse Spark provides a provisional structured observation; a separate authorized reviewer confirms or corrects it; an audited, human-reviewed, located incident appears distinctly on the map.
**Stack:** Next.js 16, React/TypeScript, Tailwind plus existing semantic tokens, Supabase Auth/Postgres/PostGIS/RLS/private storage, Meta Muse Spark, Vercel. Preserve the newly merged collapsible sidebar.

## 1. Findings — factual and code audit

- GitHub main and production Vercel are aligned and build CI passed. The public browser smoke does NOT demonstrate authenticated reporter-to-reviewer behavior.
- Staging Supabase project ytfaetqvtbsbmcsdlkvk: one located report in needs_review, one successful persisted muse-spark-1.3 analysis and successful AI usage record; ZERO review actions and ZERO reviewed reports. Reporter, reviewer and admin roles exist, but verified cross-account access and a reviewed-map result have not been demonstrated.
- Production Supabase ywopsafppyykhwrejliz: zero reports, analyses and reviews. Never seed production just to populate a demo.
- The repository already includes UploadFlow, an idempotent analysis API, a transactional review RPC, role-scoped reports, map/detail views, DEMO_MODE, labeled synthetic landing samples and a safeguarded staging seed script. Preserve these rather than rebuilding.
- The opt-in protected GitHub workflow .github/workflows/staging-integration-verification.yml can run tests/e2e/authenticated-flow.spec.ts using staging secrets; run_authenticated_e2e is false by default. No observed passing authenticated run, and no double-run evidence. Its automated flow is API-heavy and still needs a genuine UI rehearsal.
- The existing docs/DEMO_SCRIPT.md describes a navigation showcase. docs/HACKATHON_SUBMISSION_2026.md describes the full real reporting demonstration. Unify the judge-facing path and explicit fallback without claiming a staged fixture is real.
- Open release issues #21 (SMTP/email confirmation and temporary test users), #30 (migration ledger reconciliation). Staging security advisor warns about callable security-definer functions and disabled leaked-password protection; do not broadly change grants during a demo UI pass.

## 2. Ordered implementation plan — only after review

### Priority 1 — ENHANCE
- [ ] Use the existing pending staging report to determine reviewer visibility, event membership and available review actions through authorized, read-only inspection before creating any new records.
- [ ] Make the real demo path obvious: landing → reporter login → photo upload with explicitly selected location → saved report ID → provisional Muse analysis → separate reviewer login → confirm/correct → review audit → appropriately labeled map pin.
- [ ] Offer a clearly separated sample-only tour (landing sample map and labeled synthetic fixtures) when accounts, network, AI budget, model provider or map tiles fail. It never masquerades as live inference or modifies real Supabase records.
- [ ] Keep all model output tagged provisional; no automatic emergency dispatch, no invented coordinates, no AI self-verification.

### Priority 2 — REFINE
- [ ] Retain AppShell/WorkspaceFrame/WorkspaceSidebar, UploadFlow, ReviewWorkbench, DashboardCommandWorkspace, IncidentMap and their API and RLS contracts. Fix only reproduced issues, not speculative design flaws.
- [ ] Align status language across report card, queue, detail, notifications and map: uploaded, analyzing, needs_review, needs_manual_review, reviewed, retryable_error.
- [ ] Use an isolated demo-only fixture adapter for the fallback; never quietly return synthetic records from live authenticated APIs. Preserve the explicit demo-mock-v1 provenance marker.
- [ ] Reuse shared role-aware navigation, design tokens and pending-report status; avoid duplicate controls.

### Priority 3 — POLISH
- [ ] Desktop >=1440px: compact top bar plus collapsible navigation, with remaining dashboard width split 65% map/timeline versus 35% queue/details/pins; no clipping or long-coordinate overflow.
- [ ] Tablet 768–1024px: top-bar navigation drawer; map first at 400px; stacked timeline/queue/details; no overlay covering reviewer buttons.
- [ ] Mobile 320–480px: single column, map at 320px, scrollable hazard pills, stacked/accordion details, vertically stacked full-width actions, touch targets at least 44x44px.
- [ ] Reuse semantic tokens from src/app/styles/tokens.css: --paper, --sheet, --rule, --ink, --tide, --amber (AI provisional), --green (human-reviewed), --brick, spacing --s-*, typography --step-*, radius --r-panel / --r-ctl.
- [ ] Add honest loading/empty/error, 4/8px spacing, visible hover/focus/active, long-text wrap, scrims over images, image aspect ratios, reduced motion, no absolute-positioned text.

### Priority 4 — SOLIDIFY
- [ ] Keep private original/derivative storage and RLS; never expose the service-role secret or signed URLs through UI or test artifacts.
- [ ] A failed model request must preserve the uploaded report, show clear manual-review or bounded retry, and never silently upload duplicate evidence. Confirm idempotent analysis behavior and transient-failure handling.
- [ ] Distinct reviewer must be authorized for the event and action. Use existing atomic review RPC and immutable review history; do not invent approvals.
- [ ] Confirm that pending/AI-only map items are never styled or described as human-confirmed, and unknown-location reports are never assigned coordinates.
- [ ] Handle expired sessions, missing AI key, provider errors, broken images, blocked map/WebGL tiles, offline upload and unexpected API responses with visible recoverable states.
- [ ] No blind Supabase db push. No modifications to production data or authentication exemptions. Keep owner approval separate for any paid AI execution.

### Priority 5 — TEST LAST
- [ ] Run lint, typecheck, unit/integration tests, production build and Playwright at 320x800, 768x1024 and 1440x900. Assert no horizontal scrolling, focus, 44px controls, semantic warnings and reduced motion.
- [ ] Use owner-approved protected staging credentials and explicitly opt in to real Meta calls on Staging integration verification. Verify reporter→real Muse→independent reviewer→review history→map with real JWTs.
- [ ] Rehearse the **complete live demo twice consecutively** at the same intended presentation target. Record each attempt independently (result, exact SHA, non-secret model ID, reviewer audit existence, map proof, elapsed time). A skipped or mocked test does not count.
- [ ] Test degraded modes: model outage, offline/network loss, expired token, map tile failure, unknown location, double submit, denied cross-user evidence access and retry after server interruption.
- [ ] Define Done only when both full passes succeed, CI is green, the UI meets target breakpoints, one-paragraph script and known limitations are published.

## 3. Target component tree

PublicLanding
  Hero / WorkspaceLink / MapPreview (always labeled sample)
Authenticated AppShell
  WorkspaceFrame / CollapsibleSidebar / MobileDrawer
  UploadFlow → report upload API → analysis API (real, provisional)
  ReviewQueue → ReviewWorkbench → atomic review API
  DashboardCommandWorkspace → IncidentMap + Timeline (65%) / Queue + Details (35%)
DemoFallback (isolated static/seeded tour, never presented as live data)

## 4. Risks and owner verifications

- Staging report is pending despite saved real Muse analysis; distinct reviewer permission, atomic write, audit and map are the immediate blockers.
- Protected GitHub staging secrets are unavailable through this read-only audit; do not request passwords in chat. Live AI calls can incur usage and need explicit opt-in.
- API-heavy E2E does not substitute for two browser-driven complete demos. The standalone browser tests are not signed-in tests.
- Static sample tour can still work without AI; it is not a guaranteed offline upload or real persisted analysis. Do not store/replay sensitive photos as demos.
- Issue #21 (email verification) and #30 (migration history) and security-advisor warnings remain unresolved release risks.

## 5. One-paragraph judge script (target 2½ minutes)

“TerraResponse AI helps communities organize disaster evidence without treating AI guesses as confirmed emergencies. As a reporter, I submit a clearly labeled synthetic test photo with its chosen location, and the platform saves a private report. Meta Muse Spark suggests the incident category, preliminary severity and uncertainties; everything is labeled unverified. A different authorized reviewer inspects that evidence and confirms or corrects it, leaving a durable audit action. The human-reviewed located report is then identifiable on the incident map and in the response queue. If the model or map tiles are unavailable, the report stays available for human review, while our separate, openly labeled sample tour shows the interface without claiming real inference. This is decision support, not emergency dispatch.”

## 6. Known limitations

- One staging report and one successful Muse analysis; no review action or reviewed map record at audit.
- Two consecutive authenticated browser demos have not been verified; ordinary CI covers primarily public/isolated surfaces.
- Production database is empty and is not a demonstration seed target.
- Muse depends on network/provider credentials and a budget; map tiles depend on network/WebGL; offline fixture mode is not live inference.
- Auth email confirmation exception (#21), staging migration history (#30) and security-advisor warnings remain open.

## 7. Next step / stop gate

Owner reviews this plan before any application code, database, accounts, paid model activity or deployment changes. After approval, execute priorities 1–4 on a separate feature branch and priority 5 last. Merge only with passing evidence and reviewed scope.

---

# Earlier planning history (retained verbatim)

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


---

# Production public assets + login imagery plan — November 5, 2026

**Status: AWAITING OWNER REVIEW — PLAN ONLY. No implementation/merge/production deployment.**

**Baseline:** GitHub main `121f75e6c6f58bd4651827fc074eb1d66aac0dd1` (CI success), matching Vercel production READY deployment `dpl_4RiXh8ySApY4UUSmJZgVQX5x6475`. The supplied production login screenshot shows broken header + editorial `/logo.svg` images and `/demo/flood-aerial.png`.

## 1. Findings

- `middleware.ts` has a concrete source-level error: both `config.matcher` and `isStaticAsset` bypass `/_next/*`, `/favicon.ico` and `/robots.txt` but **not** `/logo.svg`, `/icon.svg`, or the files in `public/demo`, `public/brand`, `public/hero`, and `public/assets`. When Supabase is configured, signed-out requests to those files can be redirected to `/login`. Their presence in the repository rules out a simple missing-source-file explanation.
- `Wordmark.tsx` loads `/logo.svg`; `LoginContent.tsx` loads `/demo/flood-aerial.png`. Both are affected by that routing rule.
- CI's browser smoke runs without Supabase configuration; its bypass path masks this regression. `src/lib/login-middleware-redirect.test.ts` tests auth pages and protected routes but omits public asset requests.
- Preview uses a different build/deployment. Its logo rendering does not rule out the production middleware defect; actual anonymous HTTP status/header comparisons remain unverified because direct HTTP access was unavailable.
- Existing frontend structure is largely intentional; avoid speculative layout redesign. Issue #21 email confirmation cleanup is a separate production release gate.

## 2. Ordered plan

### Priority 1 — ENHANCE
- [ ] Restore anonymous access to every intentional `public/` brand/demo/hero asset, including SVG, JPG, PNG and MP4.
- [ ] Ensure the login preview degrades to a useful accessible fallback on media errors, without hiding failures.

### Priority 2 — REFINE
- [ ] Define one narrow, explicit public-asset allowlist (exact paths + known public asset prefixes) for `middleware.ts`; use it consistently in matcher/runtime bypass behavior.
- [ ] Preserve private Supabase evidence restrictions, protected pages, API auth, and the single shared `Wordmark`. Do **not** implement a blanket extension-based auth bypass.

### Priority 3 — POLISH
- [ ] Preserve the current split login with brand and 16:9 scrimmed media at desktop >=1440px; validate tablet 768–1024px stack (including the existing 899px breakpoint), and mobile 320–480px form-first, full-width controls, 44px targets.
- [ ] Check theme contrast, keyboard focus/hover/active states, long labels, image aspect ratios, reduced-motion behavior, and no horizontal scroll; reuse existing Tailwind classes and CSS tokens.

### Priority 4 — SOLIDIFY
- [ ] Add middleware regression tests in **configured, signed-out** mode: `/logo.svg`, `/icon.svg`, `/demo/flood-aerial.png`, `/brand/readme-banner.svg`, `/hero/terraresponse-bg.mp4`, representative `/assets/aistudio/*.png`. Assert no redirect and no session refresh.
- [ ] Negative tests for `/dashboard`, `/review`, and other protected routes; preserve API route authorization.
- [ ] Add browser assertions for anonymous asset response 200, proper content type, logo/preview natural image dimensions, and explicit missing-media fallback.
- [ ] No database, secrets, auth policy, inference, or report workflow changes in this fix.

### Priority 5 — TEST (only after 1–4)
- [ ] Execute `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, relevant Playwright tests; report observed results.
- [ ] Browser smoke at 320x800, 768x1024, 1440x900; assert zero broken images and overflow, good focus/reduced-motion behavior.
- [ ] Compare anonymous production vs preview asset response status, redirect chain, content type, and caching. Rehearse the real authenticated reporter → Meta → reviewer → map staging path separately; do not claim it passes because public UI tests pass.
- [ ] Submit a minimal PR for review **only after** all checks pass. Do not merge or deploy until explicit owner review; Issue #21 remains a separate release blocker.

## 3. Target component tree

```text
Next Middleware
  static Next internals / explicit public assets / public auth routes
  protected application routes / individually authorized API routes
RootLayout → brand metadata (favicon.ico, icon.svg)
LoginContent
  Topbar → Wordmark (/logo.svg)
  AuthPortal
    Aside → Wordmark (/logo.svg) + 16:9 FloodPreview (/demo/flood-aerial.png; graceful fallback)
    Main  → existing Supabase sign-in action (unchanged)
Dashboard → existing 65/35 desktop map + timeline / queue (unchanged)
```

## 4. Tokens, risks, and definition of done

Use the existing `src/app/styles/tokens.css` semantic colors, spacing and typography; Tailwind flex/grid on touched layouts only. Main risks: overly broad auth bypass, a fix that merely hides image errors, preview/production environment drift, and CI that never exercises configured middleware. Done means authentic 200 asset responses, intact role protections, zero broken login imagery, no overflow at required widths, and green test gates. A true 2–3 minute end-to-end demo additionally needs separately verified real staging credentials, Meta inference and independent human review.

## 5. Changes and next step

**Plan documentation only** on branch `plan/production-public-assets-20261105`. Request explicit owner approval of this plan before beginning app edits. No implementation, merge, Vercel redeploy, or Supabase mutation performed.


---

# Approved extension — collapsible workspace sidebar (2026-11-05)

**Owner request:** “Please proceed. also can you implement a mixed of sidebar for navigation. collapsible instead of a horizontal nav bar.” Prior public-asset plan is approved for implementation. This addition extends the approved work to the authenticated shell only; public landing and login retain their compact top navigation.

## Findings (source review)
- \`TopBar.tsx\` contains long horizontal navigation at desktop >=1440px and a stacked mobile drawer. It competes for width and doesn't provide a compact desktop layout.
- \`AppShell.tsx\` composes header, banner, page and footer but has no persistent sidebar column.
- Existing \`isNavHrefActive\`, role and flag visibility, pending-review count, \`ThemeToggle\`, \`UserMenu\`, \`Wordmark\`, and \`NavPendingIndicator\` must be preserved.
- Existing dashboard has its own >=1440px 65/35 map-queue split; adding a 264px sidebar consumes viewport width. Preserve existing proportions within available content width; don't introduce horizontal overflow.
- Existing responsive smoke only covers a public landing, not authenticated sidebar interactions.

## Priorities 1 → 5
1. **ENHANCE:** Move authenticated navigation into a persistent, elegant desktop sidebar; add expanded text/icon and collapsed icon-only modes. Mobile/tablet use a slide-in modal drawer opened by a header menu button; no desktop horizontal nav.
2. **REFINE:** Split shell into small components: \`AppShell\` server, \`WorkspaceFrame\` client state, \`TopBar\` compact header, \`WorkspaceSidebar\` shared role-aware link registry. Do not duplicate route authorization; every route remains server enforced.
3. **POLISH:** Desktop >=1024: sidebar width 264px expanded, 76px collapsed, fluid main. Tablet 768–1023: drawer triggered from header, existing map height 400px. Mobile 320–480: drawer width min(304px, 90vw), 44px menu/toggle/links, scrollable navigation, no body overflow. Sidebar groups, Lucide iconography, active state, pending count badge, semantic tokens, softened borders, accessible hover/focus/active, reduced-motion behavior, brand wordmark; content remains readable at 320px.
4. **SOLIDIFY:** Close drawer on route click, Escape, overlay click and when browser navigation changes route. Trap keyboard focus in drawer, restore opener focus on closing, lock background scroll, \`aria-expanded\`, \`aria-current\`, \`aria-label\`. Keep role/triage flag gating, status indicator, account and theme controls. No changes to database, Supabase auth, inference or API logic.
5. **TEST LAST:** After implementation, run lint/typecheck/test/build and an authenticated/fixture sidebar component test plus Playwright where possible. Regression check at 320/768/1440 for zero horizontal overflow, keyboard and reduced motion, route-active links and no unauthorized visible link; verify public asset URLs anonymously with configured middleware and 200+image MIME responses.

## Target component tree
\`\`\`
AppShell [server]
  WorkspaceFrame [client: desktop collapsed and mobile drawer state]
    TopBar [brand, mobile menu, theme, profile]
    Desktop WorkspaceSidebar [grouped links / collapse button]
    Responsive Main [DemoBanner, route children, footer]
    Mobile WorkspaceSidebar [modal drawer, same link data, close control]
Dashboard route [unchanged: map + timeline / queue]
\`\`\`

**Risks:** Preview deployment may differ from production. Explicit public asset allowlist must not exempt evidence or any API route. No protected routes should become anonymously accessible. A narrower dashboard content column may change layout at some in-between widths. Authenticated end-to-end staging demo remains unverified independently of frontend tests.

**Implementation authority:** Owner's “Please proceed” approves the previous asset plan. The sidebar work is newly requested in the same message; retain this plan in the PR and implement that scope without unrelated feature growth. Merge only if code checks are green and the branch is current.
