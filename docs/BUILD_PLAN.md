# TerraResponse AI — Build Plan

> Companion to `PRODUCT_SCOPE.md`, `ARCHITECTURE.md`, `SECURITY.md`,
> and `DECISIONS.md`. This document fixes the phase-by-phase
> implementation plan, the report lifecycle, the retry policy, the
> test fixtures, the cost controls, the three-minute demo script,
> the acceptance checklist, and the critical-path sequence with
> cuttable optional scope. **No application code is written in this
> planning step**; this is the gate before Phase 2 begins.

## 1. Phase Overview

The build is split into six phases. Phase 1 is complete; the rest are
planned in detail below. The user explicitly authorizes each phase
before the next begins (per master rule 15).

| Phase | Name | Status | Build effort | Critical? |
|---|---|---|---|---|
| 1 | Foundation & Authentication | ✅ done | — | yes |
| 2 | Events, Upload & Storage | planned | ~2–3 sessions | yes |
| 3 | AI Analysis & Schema Validation | planned | ~1–2 sessions | yes |
| 4 | Human Review & Audit | planned | ~1–2 sessions | yes |
| 5 | Map, Dashboard & Profile | planned | ~1–2 sessions | yes |
| 6 | Polish, Demo & Deploy | planned | ~1 session | yes (demo) |

Stretch (optional) phases interleaved with the above:

- **5.5** SAM 3.1 segmentation masks (optional, cuttable)
- **6a** Real-time WebSocket review-queue pushes (optional, cuttable)
- **6b** Playwright E2E tests (optional, cuttable)
- **6c** Production deployment hardening (optional, cuttable)

## 2. Report Lifecycle

The lifecycle uses six primary statuses, as specified in the user
brief. The Phase 1 schema's eight-status uppercase model is
migrated to this in Phase 2 (`ARCHITECTURE.md` §5.8).

### 2.1 Statuses

| Status | Meaning | Visible to | Mutations |
|---|---|---|---|
| `uploaded` | Image stored, location confirmed (or unknown), AI not yet invoked | contributor + reviewer/admin | contributor can edit/delete; system transitions to `analyzing` |
| `analyzing` | AI call in flight | contributor + reviewer/admin | system transitions to `needs_review` / `needs_manual_review` / `retryable_error` |
| `needs_review` | AI returned a schema-valid result; awaiting reviewer | contributor (status only) + reviewer/admin | reviewer transitions to `reviewed` |
| `reviewed` | Reviewer has acted; final state for the MVP | contributor (summary) + reviewer/admin + public map (if confirmed/flagged/resolved with location) | admin can re-open to `needs_review` in extreme cases (audit-logged) |
| `needs_manual_review` | AI failed validation (or the reviewer wants a fresh manual pass) and the reviewer must do the analysis by hand | contributor (status only) + reviewer/admin | reviewer transitions to `reviewed` after manual entry |
| `retryable_error` | Transient AI failure (timeout, network, 5xx); scheduled for backoff retry | contributor (status only) + reviewer/admin | system retries; on success → `needs_review`; on exhausted retries → `needs_manual_review` |

A separate `reviewOutcome` field on `Report` records the reviewer's
decision once status is `reviewed`:

- `confirmed` — the AI was right; the incident is verified.
- `flagged` — the report is unclear or low-confidence; needs
  follow-up but is not rejected.
- `rejected` — the submission is not a disaster photo, duplicates
  an existing incident, or is unsafe to publish.
- `resolved` — the incident is closed.

Only `confirmed`, `flagged`, and `resolved` reports with
`locationSource != 'unknown'` appear on the public map. `rejected`
reports are kept for audit but not published.

### 2.2 State Diagram (Text)

```
                    ┌─────────────┐
                    │   uploaded  │  ← contributor creates (Phase 2)
                    └──────┬──────┘
                           │ system triggers AI
                           ▼
                    ┌─────────────┐
                    │  analyzing  │
                    └──────┬──────┘
              ┌────────────┼────────────┐─────────────┐
              │            │            │             │
        schema-valid  schema-invalid  transient  (reviewer can force
              │            │            │             to needs_manual_review
              ▼            ▼            ▼             from analyzing)
        ┌──────────┐  ┌──────────────┐  ┌─────────────┐
        │needs_revw│  │needs_manual_ │  │ retryable_  │
        └─────┬────┘  │   review     │  │   error     │
              │       └──────┬───────┘  └──────┬──────┘
              │              │                 │
              │ reviewer     │ reviewer        │ backoff retry
              │ acts         │ acts            │ (auto)
              ▼              ▼                 ▼
              ┌──────────────────┐        (retry loop → analyzing)
              │     reviewed     │
              │ + reviewOutcome  │
              │ (confirmed |     │
              │  flagged |       │
              │  rejected |     │
              │  resolved)       │
              └──────────────────┘
```

### 2.3 Transitions and Audit

Every transition writes an `AuditLog` entry with action
`STATUS_CHANGE` and metadata `{ from, to, reason }` unless the
transition is part of a `REVIEW` or `ANALYZE` action, in which case
the audit entry uses those actions. This avoids double-logging. The
`ReviewAction` row also captures `previousStatus` and `newStatus`.

## 3. Failed Operations & Retries

### 3.1 Failure Categories

| Category | Example | Status | Action |
|---|---|---|---|
| Upload failure (client) | File too large, wrong MIME | n/a | Browser shows inline error; no record created |
| Upload failure (server) | Disk full, sharp decode error | n/a | 500 returned; no record created; audit `STATUS_CHANGE` with `{error}` |
| AI call: transient | Timeout, network, 5xx from provider | `retryable_error` | Schedule backoff retry |
| AI call: permanent | 4xx (bad request, quota exhausted) | `needs_manual_review` | Reviewer does manual analysis |
| AI schema invalid | Malformed JSON, out-of-enum, missing fields | `needs_manual_review` | Reviewer does manual analysis |
| AI budget exhausted | `aiCallCount >= aiCallBudget` for the event | `needs_manual_review` | Admin can raise budget or reviewer does manual |
| Reviewer action conflict | Another reviewer acted first | unchanged | 409 returned; UI refreshes the queue |
| Reviewer action on own report | `reporterId === reviewerId` (non-admin) | unchanged | 403 returned; `PERMISSION_DENIED` audit |

### 3.2 Retry Policy

For `retryable_error`, the system uses exponential backoff with a
cap. Implementation is in-process (a `setInterval` poller in the MVP;
a real queue in production):

```
retryCount = 0: retry after  10 seconds
retryCount = 1: retry after  30 seconds
retryCount = 2: retry after  90 seconds
retryCount = 3: retry after 270 seconds
retryCount = 4: retry after 810 seconds (13.5 minutes)
retryCount >= 5: stop retrying; transition to needs_manual_review
                 with lastError = "AI retry exhausted after 5 attempts"
```

The poller (a single `setInterval` started in a Phase 3 mini-service
or in a route handler's `setImmediate` for the MVP) queries
`db.report.findMany({ where: { status: 'retryable_error',
nextRetryAt: { lte: now } }, take: 10 })` every 5 seconds and
re-runs the AI call. Each retry increments `retryCount` and writes
`lastError`. The `nextRetryAt` field is computed as
`now + backoff(retryCount)`.

For the sandbox MVP, the poller can be a single `setInterval`
inside a long-running mini-service (per the fullstack-dev skill's
mini-service pattern) on a separate port (e.g., 3003). The main
Next.js app does not block on it. If the mini-service is cut for
time, the reviewer can manually re-trigger analysis from the
Review Queue (`POST /api/reports/[id]/analyze` with a reviewer
session — Phase 4 affordance).

### 3.3 Reviewer Manual Override

A reviewer can at any time transition a report from
`retryable_error` or `analyzing` to `needs_manual_review` via a
"Force manual review" button in the Review Queue. This is a
`POST /api/reports/[id]/review` with `action: 'flag'` and a
comment, and it sets `status: 'reviewed', reviewOutcome: 'flagged'`
after the reviewer's manual entry.

## 4. Phase Detail

### Phase 2 — Events, Upload & Storage

**Goal**: contributor can pick an event, upload an image, confirm
location, and see the report in their profile.

**New files**:

- `prisma/schema.prisma` — add `Event`, `EventMember`; revise
  `Report` (new lifecycle, new fields, new `eventId` FK).
- `src/lib/storage.ts` — `save`, `read`, `getStripped`, `getThumbnail`,
  `readExifGps`, `readExifCapturedAt`. Uses `sharp` and a small EXIF
  reader (`exifr` — add to deps).
- `src/lib/api-schemas/reports.ts` — Zod schemas for upload + location.
- `src/lib/api-schemas/events.ts` — Zod schemas for event create/list.
- `src/app/api/events/route.ts` — `GET` (list active events, any
  authenticated user) + `POST` (create, admin only).
- `src/app/api/reports/route.ts` — `POST` (upload, multipart) +
  `GET` (list, role-filtered via `reportReadWhere`).
- `src/app/api/reports/[id]/route.ts` — `GET` (one, authz) +
  `PATCH` (status, authz).
- `src/app/api/reports/[id]/location/route.ts` — `PATCH` (confirm
  location, `canMutateReport`).
- `src/app/api/uploads/[id]/route.ts` — `GET` (serve image; authz
  checked; serves stripped for reviewers, original for contributor).
- `src/components/views/upload-view.tsx` — replace placeholder with
  real form: event select, file input, EXIF preview, location
  confirmation map, submit.
- `src/components/views/profile-view.tsx` — replace placeholder
  submission history with the contributor's actual reports.
- `scripts/seed-events.ts` — seed two demo events.
- `tests/fixtures/images/` — 3–5 sample disaster photos with EXIF.

**Tests**:

- `src/lib/storage.test.ts` — MIME/size caps, EXIF read, stripped
  copy has no EXIF.
- `src/lib/api-schemas/reports.test.ts` — Zod accept/reject.
- `src/app/api/reports/route.test.ts` — integration: upload requires
  auth, enforces size cap, creates a report + audit entry.
- `tests/migration.test.ts` — asserts every existing test-fixture
  Report row ends up in the expected new status / `reviewOutcome`
  after the Phase 2 schema migration (traces to `ARCHITECTURE.md`
  §5.8 step 6). This test seeds a few Phase-1-shape Reports before
  the migration runs and queries them after, verifying
  `UPLOADED → uploaded`, `CONFIRMED → reviewed + reviewOutcome:
  confirmed`, etc., and `locationAccuracy: high → locationSource:
  exif`.

**Migrations**: `db:push --accept-data-loss` per `ARCHITECTURE.md`
§5.8.

### Phase 3 — AI Analysis & Schema Validation

**Goal**: server-side AI call produces a validated structured result;
report transitions through `analyzing` to `needs_review` /
`needs_manual_review` / `retryable_error`.

**New files**:

- `src/lib/ai/prompt.ts` — fixed system prompt.
- `src/lib/ai/schema.ts` — Zod schema for the AI output (caption,
  categories, hazards, severity, confidence, peopleVisible).
- `src/lib/ai/muse-spark.ts` — `analyze(imagePath)` returns
  `{ ok: true, raw, parsed } | { ok: false, kind: 'transient' |
  'permanent' | 'schema_invalid', error }`. Server-only. Uses
  `z-ai-web-dev-sdk` in sandbox, Meta Muse Spark in prod.
- `src/app/api/reports/[id]/analyze/route.ts` — `POST` triggers
  analysis; route handler runs `analyze`, writes `Analysis` row,
  transitions status.
- `mini-services/retry-poller/` — `setInterval` poller for
  `retryable_error`. (Cut to "manual re-trigger only" if time-boxed.)

**Tests**:

- `src/lib/ai/schema.test.ts` — accept a known-good response, reject
  malformed JSON, out-of-enum categories, out-of-range severity.
  Also: accept each of the 8 `detectedCategories` values, reject any
  other string (traces to `SECURITY.md` §6.3).
- `src/lib/ai/muse-spark.test.ts` — mock the SDK; assert the
  function classifies transient vs. permanent errors correctly.
- `src/app/api/reports/[id]/analyze/route.test.ts` — integration:
  happy path → `needs_review`; bad schema → `needs_manual_review`;
  transient → `retryable_error`.
- `src/app/api/reports/[id]/analyze/budget.test.ts` — integration:
  when the event's `aiCallCount >= aiCallBudget`, the analyze route
  returns 402 `BUDGET_EXHAUSTED` and the report is parked in
  `needs_manual_review` (traces to `SECURITY.md` §11 verification
  table and §5 "AI cost runaway" row).

### Phase 4 — Human Review & Audit

**Goal**: reviewer confirms/flags/rejects/resolves; every action is
audited; reviewer cannot review their own report.

**New files**:

- `src/lib/priority.ts` — `compute(report, analysis)` → 0–100
  provisional score. Pure function.
- `src/app/api/reports/[id]/review/route.ts` — `POST` reviewer
  action with `action`, `comment?`, `severityOverride?`,
  `categoryOverride?`. Enforces `canActOnReview` and
  `reporterId !== reviewerId` (unless admin).
- `src/app/api/audit/route.ts` — `GET` paginated audit log
  (reviewer/admin).
- `src/app/api/dashboard/route.ts` — `GET` aggregated stats.
- `src/components/views/review-view.tsx` — replace placeholder with
  real Review Queue. Per-report detail panel with AI summary,
  photo, location, action buttons.
- `src/components/views/audit-view.tsx` — replace placeholder with
  real table (paginated, filter by action/actor).

**Tests**:

- `src/lib/priority.test.ts` — band assignments, edge cases.
- `src/app/api/reports/[id]/review/route.test.ts` — happy path,
  conflict (409), self-review (403), permission-denied for reporter.

### Phase 5 — Map, Dashboard & Profile

**Goal**: Incident Map renders confirmed incidents with clustered
pins; Dashboard shows aggregated stats; Profile shows the
contributor's submissions.

**New files**:

- `src/app/api/reports/route.ts` (extend) — add `?onMap=true` and
  `?mine=true` query params.
- `src/components/views/map-view.tsx` — replace placeholder with
  real MapLibre GL JS map. Clustered pins, severity colors, side
  panel on pin click. (MapLibre is a JavaScript vector-tile
  renderer; no matplotlib / Python charting is involved in this
  view. If a future phase adds server-side map thumbnail
  generation via matplotlib, that script must follow the master
  rule 7 layout-hygiene guidance — pass `constrained_layout=True`
  to `plt.subplots` and do not also call `tight_layout`.)
- `src/components/views/dashboard-view.tsx` — replace placeholder
  with real fetch + stat cards + recent-activity feed.
- `src/components/views/profile-view.tsx` — replace placeholder
  with real fetch of the contributor's reports.

**Tests**:

- `src/app/api/reports/route.test.ts` — `onMap=true` excludes
  non-reviewed and unknown-location reports.
- `src/components/views/map-view.test.tsx` — render with fixture
  data, assert pins render.

### Phase 5.5 (Optional) — SAM 3.1 Segmentation Masks

**Goal**: reviewer can request a SAM 3.1 mask for a report to see
the affected region highlighted.

**Cut consequence**: AI's coarse description is still usable; reviewer
loses the visual mask overlay.

**New files**:

- `src/lib/ai/sam.ts` — `segment(imagePath, hint?)` returns a mask
  PNG. Server-only. Gated by an explicit reviewer request
  (`POST /api/reports/[id]/segment`); never automatic.
- `src/app/api/reports/[id]/segment/route.ts` — `POST` triggers
  segmentation (reviewer/admin). Increments a separate
  `samCallCount` per event with its own budget.

### Phase 6 — Polish, Demo & Deploy

**Goal**: clean three-minute demo; production deployment (stretch).

**Tasks**:

- Run the full three-minute demo script (§8) end-to-end manually;
  fix any friction.
- Add the grep test for "no external fetch in src/lib/" (SECURITY
  §6.1).
- Add the ESLint rule that forbids client components from importing
  server-only modules (SECURITY §7).
- Add the audit-log append-only grep test (SECURITY §11).
- (Stretch 6c) Vercel deploy + Postgres + S3.
- (Stretch 6b) Playwright E2E test that automates the demo script.
- (Stretch 6a) WebSocket mini-service for real-time review-queue
  pushes.

## 5. Test Fixtures

| Fixture | Location | Purpose |
|---|---|---|
| Demo users (3) | seeded via `scripts/seed.ts` (Phase 1 ✅) | reporter@terra.ai / reviewer@terra.ai / admin@terra.ai, password `<role>123` |
| Demo events (2) | seeded via `scripts/seed-events.ts` (Phase 2) | "Demo Hurricane Helene — Asheville", "Demo LA Wildfires — Pacific Palisades" |
| Sample images (5) | `tests/fixtures/images/` (Phase 2) | flood.jpg, wildfire.jpg, structural_damage.jpg, debris.jpg, road_blockage.jpg — each with EXIF GPS and capture timestamp. These 5 cover the most common `detectedCategories` values; the remaining 3 (`landslide`, `storm`, `other`) are exercised by the Zod schema unit test only (see `SECURITY.md` §6.3). |
| Image with no EXIF | `tests/fixtures/images/no_exif.jpg` (Phase 2) | tests the "manual pin" branch |
| Image too large | `tests/fixtures/images/too_large.jpg` (Phase 2) — synthetic 11 MB file generated in test setup | tests the size cap |
| Mock AI responses | `tests/fixtures/ai-responses/` (Phase 3) | valid.json, schema_invalid.json, transient_error.json, permanent_error.json — used to mock the AI SDK in integration tests |
| Sample reports (10) | seeded via `scripts/seed-reports.ts` (Phase 3) | 4 in `needs_review`, 2 in `needs_manual_review`, 2 in `reviewed/confirmed`, 1 in `reviewed/flagged`, 1 in `uploaded` — used for Dashboard / Map / Review Queue tests |

The fixture images are sourced from public-domain disaster stock
photos or generated via the image-generation skill if no suitable
public-domain image is available. The fixture AI responses are
hand-written JSON files committed to the repo.

## 6. Cost Controls

The platform's main cost driver is the AI vision model. Cost is
bounded at four levels:

### 6.1 Per-Event AI Budget

Each event has `aiCallBudget` (default 500, configurable by admin)
and `aiCallCount` (incremented atomically on each successful or
failed AI call). When `aiCallCount >= aiCallBudget`, the analyze
route returns 402 with `{ error: { code: 'BUDGET_EXHAUSTED',
eventId, budget, used }}` and the report is parked in
`needs_manual_review`. The admin can raise the budget via
`PATCH /api/events/[id]` (Phase 2 admin affordance).

### 6.2 Per-User Upload Rate

20 uploads/hour per contributor, enforced in the `/api/reports`
POST route handler via a rolling window count. Returns 429 on
exceed. Configurable via the `UPLOAD_RATE_LIMIT_PER_HOUR` env var
(default 20).

### 6.3 Image Size + Dimension Caps

- Max file size: 10 MB (default; configurable via
  `UPLOAD_MAX_BYTES`).
- Max dimensions: 8000×8000 (rejected by `sharp` metadata read).
- Allowed MIME types: `image/jpeg`, `image/png`.

### 6.4 SAM 3.1 Cost Gating (Optional Phase 5.5)

SAM 3.1 has its own per-event budget (`samCallBudget`, default 50)
and counter (`samCallCount`). The segmentation route is
**opt-in**: the reviewer must explicitly click "Generate mask" —
masks are never generated automatically. The reviewer sees the
current `samCallCount` / `samCallBudget` ratio next to the button.

### 6.5 AI Response Caching (Stretch O11)

Stretch: cache the AI result keyed on the image's content hash
(SHA-256 of the file bytes). If the same image (or a near-duplicate
within a perceptual hash threshold) is re-uploaded, the cached
analysis is reused without invoking the model. Cut from the MVP
unless time permits.

### 6.6 Display

The admin Dashboard (Phase 5) shows per-event `aiCallCount` /
`aiCallBudget` and the global daily AI call count. This is a
stretch (O3); for the MVP the admin can query the DB directly.

## 7. Critical-Path Sequence With Cuttable Optional Scope

The table shows the critical path and where each optional feature
attaches. The critical path is the minimum that must work for the
demo. **Stretch** items (rows 7–12) are part of the MVP scope but
can be cut if time runs out, in the order listed (cut row 7 first,
row 12 last). **Post-MVP** items (rows 13–20) are explicitly out of
the MVP scope per `PRODUCT_SCOPE.md` §5 and are listed here for
traceability only — they are not "cut" from the MVP because they
were never in it.

### 7.1 MVP Critical Path (must build, in order)

| Order | Item | Critical? | Notes |
|---|---|---|---|
| 1 | Phase 1 (auth, audit, nav, shell) | yes | done ✅ |
| 2 | Phase 2 (events, upload, storage, location confirm) | yes | — |
| 3 | Phase 3 (AI call + Zod validation, inline flavor) | yes | switch to background retry poller only if inline > 30 s |
| 4 | Phase 4 (review queue + audit UI + priority score) | yes | — |
| 5 | Phase 5 (map + dashboard + profile with real data) | yes | — |
| 6 | Phase 6 (demo dry run + grep tests + ESLint rule) | yes | — |

### 7.2 MVP Stretch Scope (cuttable, in cut order)

| Order | Item | Cut if time short |
|---|---|---|
| 7 | O9 — Playwright E2E | cut first |
| 8 | O7 — WebSocket real-time queue | cut second |
| 9 | O11 — AI response caching | cut third |
| 10 | O3 — cost dashboard | cut fourth |
| 11 | O1 — SAM 3.1 masks (Phase 5.5) | cut fifth |
| 12 | O10 — Vercel/Postgres/S3 production deploy | cut last; demo runs in sandbox |

### 7.3 Post-MVP Scope (not built for the hackathon)

These are recorded for traceability. They are listed in
`PRODUCT_SCOPE.md` §5 as optional/cuttable but with phase
"post-MVP", meaning they are explicitly out of the hackathon MVP
scope. They appear here so a future phase can pick them up.

| Order | Item |
|---|---|
| 13 | O12 — audit log UI search/filter |
| 14 | O4 — self-signup / password reset |
| 15 | O2 — per-event membership enforcement |
| 16 | O5 — multi-image per report |
| 17 | O6 — video upload |
| 18 | O8 — i18n |
| 19 | O13 — per-event AI budget UI |
| 20 | O14 — email notifications |

## 8. Three-Minute Demo Script

The demo runs in the sandbox preview. The presenter narrates each
step.

### 0:00–0:20 — Sign In

- Open the preview URL in a browser.
- The login card renders with the TerraResponse AI brand.
- Click the "Reporter" demo-account button. Email and password fill
  automatically.
- Click "Sign in". The shell loads; the sidebar shows four items
  (Dashboard, Upload Photo, Incident Map, Profile).

### 0:20–0:50 — Upload a Photo

- Click "Upload Photo". The upload form renders.
- From the event dropdown, pick "Demo Hurricane Helene — Asheville".
- Drag a sample flood photo into the dropzone (or click to pick).
  The client validates size + MIME.
- Click "Continue". The EXIF GPS is read server-side; the map shows a
  pin at the photo's location.

### 0:50–1:20 — Confirm Location & Submit

- Drag the pin to fine-tune (or click "Confirm location as-is").
- Click "Submit". The form posts to `/api/reports`. A `Report` row
  is created with status `uploaded`. The UI shows a spinner
  ("Analyzing…") as the server transitions to `analyzing` and calls
  the vision model.

### 1:20–1:50 — Watch the AI Analysis

- The AI call returns (~5–10 s). The route handler validates the
  output against the Zod schema. The report transitions to
  `needs_review`. The UI shows the AI's preliminary summary
  (caption, detected categories, severity, confidence, hazards)
  with a yellow "AI preliminary result — pending human review"
  badge.

### 1:50–2:20 — Switch to Reviewer

- Click the user menu (top-right) → "Sign out". The login card
  renders.
- Click the "Reviewer" demo-account button. Sign in. The shell now
  shows six sidebar items (Review Queue and Audit Log added).
- Click "Review Queue". The report just submitted appears with a
  "needs review" badge.

### 2:20–2:50 — Review the Report

- Click the report to open the detail panel.
- See the photo, the AI summary, the location, and the action
  buttons (Confirm / Flag / Reject / Resolve).
- Click "Confirm". The route handler writes a `ReviewAction`, sets
  `status: 'reviewed', reviewOutcome: 'confirmed'`, and writes an
  audit entry. The report leaves the queue.

### 2:50–3:00 — See It on the Map

- Click "Incident Map". The MapLibre map renders, zoomed to the
  event's bounding box.
- The confirmed incident appears as a colored pin (severity
  band). Click the pin to see the side panel with the
  reviewer-confirmed summary, reviewer name, and timestamp.
- Done.

### Backup Demo Steps (if a step fails)

- If the AI call times out, sign in as reviewer and show the report
  in `needs_manual_review` state, then click "Force manual review"
  and enter the analysis by hand.
- If the map fails to render, fall back to the Dashboard view,
  which shows the confirmed incident in the list.

## 9. Acceptance Checklist

The MVP is acceptable when **all** of the following are true. This
is the gate for Phase 6 completion.

### End-to-End Path

- [ ] A contributor can sign in, pick an active event, upload a
  JPEG/PNG ≤ 10 MB, confirm or correct the location (or mark
  unknown), and submit.
- [ ] The submit creates a `Report` row with status `uploaded`,
  stores the image under `uploads/<eventId>/<reportId>.<ext>`,
  writes an `UPLOAD` audit entry, and returns the new report id.
- [ ] The server transitions the report to `analyzing`, invokes
  the vision model server-side, and parses the output against
  the Zod schema.
- [ ] A schema-valid response transitions the report to
  `needs_review` and stores an `Analysis` row.
- [ ] A schema-invalid response transitions the report to
  `needs_manual_review` with `lastError` set.
- [ ] A transient failure transitions the report to
  `retryable_error` and schedules a backoff retry.
- [ ] A reviewer can sign in, see the report in the Review Queue,
  open the detail panel, and pick Confirm / Flag / Reject / Resolve.
- [ ] The review action creates a `ReviewAction` row, transitions
  the report to `reviewed` with the correct `reviewOutcome`, and
  writes a `REVIEW` audit entry.
- [ ] The Incident Map shows the confirmed incident as a colored
  pin with the reviewer-confirmed summary in the side panel.
- [ ] The Dashboard shows the correct counts (total, pending
  review, confirmed, average severity).
- [ ] The Profile view lists the contributor's own submissions
  with their current status.

### Safety Boundaries (`PRODUCT_SCOPE.md` §7)

- [ ] No code in `src/` calls any external dispatch service.
- [ ] AI sections in the UI all carry the "AI preliminary result —
  pending human review" label.
- [ ] `Analysis.rawOutput` is never returned to the client (grep
  test).
- [ ] No client component imports `db.ts`, `auth.ts`, `audit.ts`,
  `authz.ts`, or `ai/*` (ESLint rule + grep test).
- [ ] No uploaded file is stored under its original filename
  (grep test for `originalFilename` in the schema — should not
  exist).
- [ ] The audit log table has no `UPDATE` or `DELETE` route
  handler (grep test).
- [ ] Every `POST` / `PATCH` / `DELETE` route handler calls
  `requireUser` or `requireRole` before any business logic
  (review).
- [ ] `requireRole` denials create an audit entry (integration
  test).
- [ ] A reviewer cannot review their own report (integration
  test, non-admin).
- [ ] A reporter cannot read another reporter's report
  (integration test).
- [ ] The public map endpoint excludes non-reviewed and
  unknown-location reports (integration test).

### Build & Quality

- [ ] `bun run lint` — 0 errors, 0 warnings.
- [ ] `bun run typecheck` — 0 errors.
- [ ] `bun run test` — all tests pass.
- [ ] `bun run build` — production build succeeds.
- [ ] The dev server starts cleanly with no console errors.
- [ ] The three-minute demo script (§8) runs end-to-end manually
  with no step failing.
- [ ] The worklog (`worklog.md`) has an entry for every phase
  completed.

### Cost Controls

- [ ] Per-event `aiCallBudget` (default 500) is enforced; exceeding
  it parks the report in `needs_manual_review` (integration test).
- [ ] Per-user upload rate limit (default 20/hour, env var
  `UPLOAD_RATE_LIMIT_PER_HOUR`) is enforced (integration test).
- [ ] Per-account login rate limit (default 10/hour, env var
  `LOGIN_RATE_LIMIT_PER_HOUR`, enforced in middleware — Phase 4)
  is enforced (integration test).
- [ ] Image size cap (default 10 MB, env var `UPLOAD_MAX_BYTES`)
  and dimension cap (8000×8000) are enforced (integration test).

## 10. Out-of-Phase Work

These are not phases but ongoing:

- **Test coverage**: every new `src/lib/` pure function gets a Vitest
  unit test in the same phase that introduces it. Route handlers
  get integration tests starting in Phase 4.
- **Worklog**: every phase appends a `worklog.md` entry per the
  master rule.
- **Demo dry-run**: at the end of each phase from 2 onward, the
  three-minute demo script (§8) is run manually; any failure is
  logged and either fixed in the same phase or recorded as a known
  limitation.
- **Inspection before changes**: every phase starts with the master
  rule 3 inspection of existing files that will be touched. Phase
  2's inspection covers the Phase 1 schema and views it replaces.
