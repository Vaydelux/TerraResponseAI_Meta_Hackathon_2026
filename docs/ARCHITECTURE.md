# TerraResponse AI — Architecture

> Companion to `PRODUCT_SCOPE.md` and `BUILD_PLAN.md`. This document fixes
> the system shape and database entities before implementation. The Phase
> 1 schema (User, Report, Analysis, ReviewAction, AuditLog) is the starting
> point; the target schema in §5 adds `Event`, `EventMember`, and the
> revised report lifecycle.

## 1. System Overview

TerraResponse AI is a single Next.js 16 application. The browser talks to
exactly one server: the Next.js App Router server. That server renders
pages, handles API requests, performs database I/O via Prisma, stores
uploaded images on the local filesystem (sandbox) or object storage
(production), and calls the configured vision model (Meta Muse Spark in
production, `z-ai-web-dev-sdk` VLM in the sandbox). There is no separate
backend service, no separate API gateway, no separate authentication
service. Everything runs inside one Next.js process and one Prisma
client.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (1 SPA route: /)                      │
│   - React 19 + Next.js App Router client components                    │
│   - shadcn/ui + Tailwind v4 + next-themes                              │
│   - MapLibre GL JS for the incident map                                │
│   - react-hook-form + Zod for upload form                              │
│   - next-auth/react useSession() for auth state                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  HTTPS (same-origin)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Next.js 16 App Router                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Server Components (rendering, /api/auth/* route handlers)       │ │
│ │  - page.tsx, layout.tsx (server-side entry)                      │ │
│ │  - src/app/api/auth/[...nextauth]/route.ts (NextAuth handler)    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Route Handlers (REST API, server-side only)                     │ │
│ │  - /api/reports          (POST upload, GET list)                 │ │
│ │  - /api/reports/[id]     (GET one, PATCH status)                  │ │
│ │  - /api/reports/[id]/analyze (POST trigger AI)                    │ │
│ │  - /api/reports/[id]/review   (POST reviewer action)              │ │
│ │  - /api/events           (GET list, POST create — admin)         │ │
│ │  - /api/audit            (GET list — reviewer/admin)            │ │
│ │  - /api/dashboard        (GET aggregated stats)                  │ │
│ │  - /api/uploads/[id]     (GET image, server-side EXIF strip)     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Library layer (server-only imports)                             │ │
│ │  - src/lib/db.ts (Prisma client singleton)                       │ │
│ │  - src/lib/auth.ts (NextAuth options + verifyPassword)          │ │
│ │  - src/lib/authz.ts (requireUser, requireRole, reportReadWhere)  │ │
│ │  - src/lib/audit.ts (append-only audit logger)                   │ │
│ │  - src/lib/types.ts (Role, ReportStatus, etc. unions)            │ │
│ │  - src/lib/nav.ts (role-gated nav items)                         │ │
│ │  - src/lib/ai/muse-spark.ts (server-side AI client wrapper)       │ │
│ │  - src/lib/ai/schema.ts (Zod schema for AI output)               │ │
│ │  - src/lib/storage.ts (image save / read / EXIF strip)            │ │
│ │  - src/lib/priority.ts (provisional score computation)           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────┬───────────────────────────────┬───────────────────────┘
              │                                │
              ▼                                ▼
   ┌─────────────────────┐         ┌─────────────────────────────┐
   │  Prisma + SQLite    │         │  Vision model provider       │
   │  (file: db/custom.db│         │  - Prod: Meta Muse Spark     │
   │   in sandbox)       │         │  - Sandbox: z-ai-web-dev-sdk │
   │                     │         │    VLM (server-only)         │
   │  7 models (see §5)  │         │  - Key in server env var     │
   └─────────────────────┘         └─────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  File storage (sandbox: /home/z/my-project/uploads/)         │
   │  - /<eventId>/<reportId>.<ext>   (original, never served)    │
   │  - /<eventId>/<reportId>.thumb.<ext> (public)                 │
   │  - /<eventId>/<reportId>.stripped.<ext> (served to reviewers) │
   └─────────────────────────────────────────────────────────────┘
```

The diagram is intentionally one-process. Adding a separate backend
service would add operational complexity (a second deploy, a second set
of secrets, a network hop, an extra auth boundary) without any benefit
for the MVP. See §3 for the full rationale.

## 2. Layered Responsibilities

### 2.1 Client (Browser)

The browser runs a single-page React application on the only user-visible
route, `/`. The shell (`src/components/terra/app-shell.tsx`) uses
`useSession()` to switch between an unauthenticated LoginCard and the
authenticated app. Inside the authenticated app the active "view" is
local component state (no router navigation, per sandbox rule that only
`/` is user-visible). The browser never imports `db.ts`, `auth.ts`,
`authz.ts`, `audit.ts`, or any AI/storage library. The `next-auth/react`
client is the only auth-related import on the client; it talks to the
Next.js server's `/api/auth/*` route handlers.

The client is responsible for rendering, optimistic UI feedback
(skeletons, toasts, error states), form validation (RHF + Zod),
MapLibre rendering, and triggering navigation between views. It is **not**
responsible for authorization, secret management, AI invocation, image
storage, or any business rule. Every server-side rule has a client-side
counterpart for UX (e.g., a reviewer button is hidden from reporters),
but the server is the source of truth.

### 2.2 Next.js Server

The Next.js server has three flavors of server-side code, all of which
run in the same process:

- **Server Components** render pages and read data via Prisma. They can
  call `getServerSession()` to gate rendering but cannot perform
  mutations directly (mutations go through route handlers or server
  actions).
- **Route Handlers** (`src/app/api/**/route.ts`) are the API surface.
  They enforce authorization with `requireUser` / `requireRole`, perform
  mutations via Prisma, log to the audit trail, and return JSON. They
  are the only entry points for browser-initiated mutations.
- **Server Actions** (added in Phase 2 if we need form-driven mutations
  without writing a route handler) are an alternative to route handlers
  for form submission. For the MVP we standardize on route handlers for
  predictability; server actions may be used where they reduce
  boilerplate.

All three flavors share the library layer in `src/lib/`. The library
layer is server-only by convention: any file that imports Prisma, the AI
SDK, the filesystem, or `next/headers` lives under `src/lib/` and is
never imported by a client component. The `next.config.ts` and bundler
rules enforce this — client components that try to import server-only
modules fail at build time.

### 2.3 Library Layer (`src/lib/`)

The library layer is organized by concern:

- `db.ts` — Prisma client singleton (one instance per process; reused
  across hot reloads in dev via `globalThis` cache).
- `auth.ts` — NextAuth options, the `verifyPassword` helper, and the
  `DUMMY_HASH` constant for the constant-time user-enumeration
  mitigation (see `SECURITY.md`).
- `authz-rules.ts` — pure authorization rules (no server imports) so
  they can be unit-tested in Vitest without a Next.js context.
- `authz.ts` — session-aware wrappers (`requireUser`, `requireRole`,
  `getSessionUser`, `AuthError`) around the pure rules; records audit
  denials.
- `audit.ts` — `writeAuditLog()` — append-only audit logger that
  captures `x-forwarded-for` (first IP only) and `user-agent` from
  `next/headers`.
- `types.ts` — shared union types (`Role`, `ReportStatus`,
  `ReviewActionType`, `AuditActionType`, `LocationAccuracy`) and the
  NextAuth `Session` / `JWT` module augmentations for typed
  `useSession()`.
- `nav.ts` — role-gated navigation items and `defaultViewForRole`.
- `ai/muse-spark.ts` — Phase 3. Wraps the configured vision model
  call. Server-only. Reads the API key from env. Returns a typed
  result or throws a classified error (transient vs. permanent).
- `ai/schema.ts` — Phase 3. The Zod schema the AI's raw output is
  parsed against. Defines `categories` (enum), `severity` (0–100),
  `confidence` (0–1), `caption` (string), `hazards` (array of typed
  objects), `peopleVisible` (boolean). Includes a `schemaVersion`.
- `storage.ts` — Phase 2. Saves uploaded files under
  `uploads/<eventId>/<reportId>.<ext>`, generates a thumbnail, reads
  EXIF, and produces a stripped copy. Enforces MIME and size caps.
- `priority.ts` — Phase 4. Computes the provisional severity score
  from `severityScore`, `confidence`, recency, and location accuracy.
  Pure function — unit-tested.

### 2.4 Persistence

- **Database**: Prisma + SQLite (file at
  `file:/home/z/my-project/db/custom.db`) for the sandbox. Production
  swaps the `datasource` to Postgres — a one-line change in
  `prisma/schema.prisma`. SQLite has no native enum type, so enum-like
  fields are stored as `String` with the union type enforced at the
  TypeScript layer (`src/lib/types.ts`).
- **File storage**: local filesystem under
  `/home/z/my-project/uploads/<eventId>/<reportId>.*` in the sandbox.
  Production uses object storage (S3 or Supabase Storage); the
  `storage.ts` interface is the same, only the implementation swaps.
- **No session storage**: NextAuth JWT strategy is stateless. No
  session table, no adapter. Trade-off: sign-out invalidates the
  client-side session but the JWT remains valid until expiry; this is
  acceptable for the MVP and revisited in `DECISIONS.md` ADR-002.

## 3. Why No Separate Backend Service

A reasonable question is whether TerraResponse AI should have a separate
backend service (a standalone Express / Fastify / Hono server, or a
separate NestJS app) alongside Next.js. The answer is **no, for the
MVP**. The reasoning:

1. **Next.js App Router already does everything we need server-side.**
   Server components render. Route handlers expose a JSON API. Server
   actions handle form-driven mutations. All three run in the same
   process as the page renderer. A separate backend would duplicate
   these capabilities without adding any.

2. **One deploy, one set of secrets, one auth boundary.** A separate
   backend service means a second deploy target, a second set of
   environment variables (including the same `NEXTAUTH_SECRET` shared
   across both services for JWT validation), a second process to
   monitor, and a service-to-service authentication boundary that has
   to be designed and audited. For a hackathon MVP this is pure
   overhead.

3. **The Prisma client is process-local.** Prisma's connection pool is
   per-process. With a separate backend we would either open a second
   pool (wasteful) or share one via an external PgBouncer (operational
   complexity). One process, one pool, no external moving parts.

4. **The AI provider is invoked server-side only.** The sandbox
   `z-ai-web-dev-sdk` rule, and the equivalent Meta rule for production,
   require the API key to stay server-side. With Next.js this means
   "don't import the SDK in a client component" — a build-time check.
   With a separate backend we would add an additional network hop and
   an additional place where the key could leak.

5. **Authorization is enforced at the application layer anyway.** The
   sandbox has no Supabase/Postgres RLS, so row-level access is
   enforced in `authz.ts` regardless of where the database lives. A
   separate backend would just move that logic, not eliminate it.

6. **The single-route SPA rule in the sandbox** means we have one
   user-visible route (`/`). A separate backend doesn't change this;
   the SPA still talks to one origin.

This is reversible: if the platform ever needs to scale the AI
inference separately from the page rendering, the route handlers in
`/api/ai/*` can be lifted into a separate service without touching the
client. The library layer (`src/lib/ai/`) and the schema
(`src/lib/ai/schema.ts`) are already isolated for that eventuality.
The decision is recorded in `DECISIONS.md` ADR-001.

## 4. Request Flow (Per Step of the User Journey)

This section traces the request flow for each step of the end-to-end
path defined in `PRODUCT_SCOPE.md` §3.

### 4.1 Sign In

Browser → `POST /api/auth/callback/credentials` → NextAuth handler →
`authorize()` → `db.user.findUnique` → `verifyPassword` (bcrypt
cost-10) → on success `writeAuditLog(LOGIN)`, return JWT → NextAuth
sets an httpOnly cookie → browser's `useSession()` re-renders the
shell → authenticated app. On failure: `writeAuditLog(AUTH_FAILED)`,
return null → NextAuth returns 401 → browser shows inline error.

### 4.2 Select Incident Event

Browser (upload view, mounted on `/`) → `GET /api/events?status=active`
→ route handler → `requireUser()` → `db.event.findMany({ where: {
status: 'active' }})` → returns events → client renders a dropdown.
Empty state if no active events.

### 4.3 Upload Image

Browser → `POST /api/reports` with `multipart/form-data` (event id,
file, optional title/description) → route handler → `requireUser()`
→ server-side MIME + size validation → `storage.save(file, eventId,
reportId)` writes the original + generates a thumbnail + reads EXIF →
`db.report.create({ data: { ... status: 'uploaded', locationSource:
'unknown' }})` → `writeAuditLog(UPLOAD)` → returns the new report id
and the extracted EXIF GPS (if any). Browser advances to the
location-confirmation step.

### 4.4 Confirm Location

Browser → `PATCH /api/reports/[id]/location` with `{ latitude,
longitude, locationSource: 'exif' | 'manual' | 'unknown', locationLabel? }`
→ route handler → `requireUser()` + `canMutateReport(user, report)`
→ `db.report.update` → returns the updated report. On success the
browser triggers the AI analysis step.

### 4.5 Create Private Evidence Record

Already done in §4.3 — the `Report` row is the evidence record. It is
private by virtue of the authz rules: a `REPORTER` can only read rows
where `reporterId === user.id`; a `REVIEWER` or `ADMIN` can read all
rows. The public map endpoint filters to `status: 'reviewed',
reviewOutcome: { in: ['confirmed', 'flagged', 'resolved'] }`.

### 4.6 Invoke Muse Spark Server-Side

Two flavors:

- **Inline (MVP)**: the `PATCH /api/reports/[id]/location` handler
  triggers the AI analysis synchronously before returning. The browser
  shows a spinner ("Analyzing…") and the response includes the
  analysis. This is the simplest path and works for a 5–10 s model
  call.
- **Background (stretch, O7-related)**: a background job queue
  (in-process `setImmediate` or `setInterval` poller in the MVP,
  replaced by a real queue in production) picks up reports in
  `analyzing` status and runs the analysis. The browser polls
  `/api/reports/[id]` until status transitions. We start with inline
  and only switch to background if the model latency exceeds 30 s in
  testing.

The AI call: `ai/muse-spark.ts` reads the stored image, calls the
configured vision model with a fixed system prompt (defined in
`src/lib/ai/prompt.ts` — see `SECURITY.md` for prompt-injection
mitigations), and returns the raw response.

### 4.7 Validate Preliminary Structured Result

`ai/schema.ts` defines the Zod schema. The route handler parses the
raw output:

- **Valid** → `db.analysis.create({ data: { ... }})` → report
  transitions to `needs_review` → returns the structured summary
  to the contributor (caption, categories, severity, confidence,
  hazards, `peopleVisible`).
- **Invalid** → `db.report.update({ status: 'needs_manual_review',
  lastError: zodError.message })` → the validation error is stored
  server-side in `lastError` (visible only to reviewers/admins via
  the Review Queue). The contributor's request returns a generic
  status (`{ status: 'needs_manual_review' }`) with no error
  details — the contributor sees "Analysis complete — pending
  reviewer action" and tracks progress in their Profile view.
- **Transient** (network/timeout/5xx from the model) → `db.report.update({
  status: 'retryable_error', retryCount: n+1, nextRetryAt: now +
  backoff(n+1), lastError: msg })` → schedules a backoff retry
  (see `BUILD_PLAN.md` §4). The contributor's request returns
  `{ status: 'retryable_error' }` with no error details.

### 4.8 Reviewer Confirms / Corrects

Browser (Review Queue view) → `GET /api/reports?status=needs_review,needs_manual_review`
→ reviewer/admin opens one → `POST /api/reports/[id]/review` with
`{ action: 'confirm' | 'flag' | 'reject' | 'resolve', comment?,
severityOverride?, categoryOverride? }` → route handler → `requireRole([
'REVIEWER', 'ADMIN'])` + `canActOnReview(user)` → `db.$transaction([
  `db.reviewAction.create({ data: { ..., previousStatus, newStatus }})`,
  `db.report.update({ status: 'reviewed', reviewOutcome, ...overrides })`,
  `db.auditLog.create({ action: 'REVIEW', ... })`,
])` → returns the updated report. On conflict (another reviewer acted
first) the transaction rolls back and the UI shows "Already reviewed
by another reviewer."

### 4.9 Map / List With Provisional Score

Browser (Incident Map view) → `GET /api/reports?status=reviewed&onMap=true`
→ route handler → `requireUser()` → `db.report.findMany({ where: {
  status: 'reviewed', reviewOutcome: { in: ['confirmed', 'flagged',
  'resolved'] }, locationSource: { not: 'unknown' }}, include: {
  analysis: true }})` → for each report computes `priorityScore` via
`priority.compute(report, analysis)` → returns the list. The browser
hands the list to MapLibre, which renders clustered pins colored by
severity band (see `types.ts` `severityBand`).

The Dashboard view (`GET /api/dashboard`) returns the same data
aggregated: total counts, average severity, pending-review count. The
Profile view (`GET /api/reports?mine=true`) returns the contributor's
own submissions.

## 5. Database Entities (Target Schema)

The Phase 1 schema (User, Report, Analysis, ReviewAction, AuditLog) is
the starting point. The target schema below adds `Event` and
`EventMember` (the EventMember table is created but not enforced in
the MVP — see `PRODUCT_SCOPE.md` §2.3), revises the `Report` lifecycle
to the six-status model from the user brief, and adds the
`reviewOutcome`, `locationSource`, `retryCount`, and `lastError`
fields.

### 5.1 User (unchanged from Phase 1)

| Field | Type | Notes |
|---|---|---|
| id | String @id @default(cuid()) | |
| email | String @unique | lowercased |
| name | String? | display name |
| passwordHash | String | bcrypt cost-10 |
| role | String @default("REPORTER") | union: REPORTER \| REVIEWER \| ADMIN (enforced in `types.ts`) |
| createdAt, updatedAt | DateTime | |
| relations | reports, reviewActions, auditLogs, eventMemberships | `eventMemberships` added with the `EventMember` table |

### 5.2 Event (NEW — Phase 2)

An incident event groups reports. Examples: "Hurricane Helene —
Asheville", "LA Wildfires — Pacific Palisades". Events are
admin-created and have a status that controls whether contributors
can submit against them.

| Field | Type | Notes |
|---|---|---|
| id | String @id @default(cuid()) | |
| slug | String @unique | URL-safe identifier, e.g. `helene-asheville-2024` |
| name | String | display name |
| description | String? | longer text |
| status | String @default("active") | union: active \| closed \| archived |
| locationLabel | String? | human-readable area name |
| bboxMinLat, bboxMinLon, bboxMaxLat, bboxMaxLon | Float? | bounding box for map filtering |
| aiCallBudget | Int @default(500) | per-event AI cost cap |
| aiCallCount | Int @default(0) | current spend against the cap |
| createdAt, updatedAt | DateTime | |
| createdById | String | FK to User (ADMIN who created it) |
| relations | reports, members | |

### 5.3 EventMember (NEW — table created, NOT enforced in MVP)

Per-event membership. For the MVP the table exists so the extension in
`PRODUCT_SCOPE.md` §2.3 doesn't need a schema migration, but the
authz layer ignores it and uses the global role only. Enforcement is
a post-MVP phase.

| Field | Type | Notes |
|---|---|---|
| id | String @id @default(cuid()) | |
| userId | String | FK to User, onDelete: Cascade |
| eventId | String | FK to Event, onDelete: Cascade |
| role | String @default("contributor") | union: contributor \| reviewer \| coordinator |
| createdAt | DateTime | |
| @@unique([userId, eventId]) | | a user has one role per event |

### 5.4 Report (revised lifecycle — Phase 2 migration)

| Field | Type | Notes |
|---|---|---|
| id | String @id @default(cuid()) | |
| reporterId | String | FK to User, onDelete: Cascade |
| eventId | String | **NEW** — FK to Event, onDelete: Restrict (don't delete events with reports) |
| status | String @default("uploaded") | union: uploaded \| analyzing \| needs_review \| needs_manual_review \| reviewed \| retryable_error (revised from Phase 1) |
| reviewOutcome | String? | **NEW** — union: confirmed \| flagged \| rejected \| resolved; set when status = reviewed |
| title | String? | |
| description | String? | |
| latitude | Float | 0 if locationSource = unknown |
| longitude | Float | 0 if locationSource = unknown |
| locationLabel | String? | |
| locationSource | String @default("unknown") | **NEW** — union: exif \| manual \| unknown (replaces the looser `locationAccuracy` from Phase 1) |
| imagePath | String | server-side path under uploads/<eventId>/ |
| imageMimeType | String | |
| imageBytes | Int @default(0) | |
| imageThumbnailPath | String? | |
| capturedAt | DateTime? | from EXIF |
| priorityScore | Int? | 0–100, computed in Phase 4 |
| retryCount | Int @default(0) | **NEW** — for retryable_error tracking |
| nextRetryAt | DateTime? | **NEW** — computed by the retry poller as `now + backoff(retryCount)`; the poller queries `where: { status: 'retryable_error', nextRetryAt: { lte: now } }`. Null when the report is not in a retry state. |
| lastError | String? | **NEW** — for retryable_error / needs_manual_review |
| createdAt, updatedAt | DateTime | |
| relations | reporter, event, analysis, reviewActions | |
| @@index | reporterId, eventId, status, createdAt | |

### 5.5 Analysis (unchanged from Phase 1)

1:1 with Report. Stores the AI's raw output and the parsed structured
result. The `rawOutput` field is server-side only — never returned to
the client; the route handler returns only the parsed fields.

| Field | Type | Notes |
|---|---|---|
| id, reportId (unique), report | | |
| modelId | String | e.g., `muse-spark-v1` or `zai-vlm-1` |
| rawOutput | String | server-side only |
| caption | String | short natural-language description |
| detectedCategories | String | JSON-encoded string[] from the allowed enum |
| hazards | String | JSON-encoded list of hazard objects |
| severityScore | Int | 0–100 |
| confidence | Float | 0–1 |
| peopleVisible | Boolean | |
| schemaVersion | String @default("v1") | |
| createdAt | DateTime | |

### 5.6 ReviewAction (revised action enum — Phase 2 migration)

Append-only history of reviewer decisions on a report. The Phase 1
schema stored the `action` field as uppercase
(`CONFIRM | FLAG | REJECT | RESOLVE | ASSIGN | COMMENT`, matching
`src/lib/types.ts` `REVIEW_ACTIONS`). The Phase 2 migration lowercases
the action values to match the lowercase lifecycle and `reviewOutcome`
conventions. The migration runs as a single `UPDATE` per old value
in the same Phase 2 step that migrates `Report.status`. The
`ReviewActionType` union in `src/lib/types.ts` is updated to the
lowercase set in the same commit.

| Field | Type | Notes |
|---|---|---|
| id, reportId, reviewerId | | |
| action | String | confirm \| flag \| reject \| resolve \| assign \| comment (lowercase in Phase 2; uppercase in Phase 1) |
| comment | String? | |
| previousStatus | String? | lowercased in Phase 2 to match the new `Report.status` |
| newStatus | String? | lowercased in Phase 2 to match the new `Report.status` |
| priorityScoreOverride | Int? | |
| createdAt | DateTime | |
| @@index | reportId, reviewerId | |

### 5.7 AuditLog (unchanged from Phase 1, not cascade-deleted)

Append-only. The `actor` relation uses `onDelete: SetNull` so the
audit trail survives user deletion. The `action` union is `LOGIN |
LOGOUT | AUTH_FAILED | UPLOAD | ANALYZE | REVIEW | DELETE |
STATUS_CHANGE | PERMISSION_DENIED | REGISTER`.

| Field | Type | Notes |
|---|---|---|
| id, actorId (nullable), actor (relation, SetNull) | | |
| action | String | |
| targetId | String? | report id, user id, etc. |
| metadata | String? | JSON-encoded |
| ip | String? | first IP from x-forwarded-for |
| userAgent | String? | |
| createdAt | DateTime | |
| @@index | actorId, action, createdAt | |

### 5.8 Schema Migration Plan (Phase 2)

Phase 1's `Report.status` uses the uppercase lifecycle
(`UPLOADED/ANALYZING/ANALYZED/IN_REVIEW/CONFIRMED/FLAGGED/REJECTED/RESOLVED`).
Phase 2 migrates to the lowercase six-status model. Migration steps:

1. Add the new columns (`eventId`, `reviewOutcome`, `locationSource`,
   `retryCount`, `lastError`) with safe defaults.
2. Add the `Event` and `EventMember` tables.
3. Insert a default event `unassigned` (slug `unassigned`) and assign
   every existing `Report` to it (`eventId = <unassigned id>`).
4. Migrate `status` values: `UPLOADED → uploaded`,
   `ANALYZING → analyzing`, `ANALYZED → needs_review`, `IN_REVIEW →
   needs_review`, `CONFIRMED → reviewed + reviewOutcome = confirmed`,
   `FLAGGED → reviewed + reviewOutcome = flagged`, `REJECTED →
   reviewed + reviewOutcome = rejected`, `RESOLVED → reviewed +
   reviewOutcome = resolved`. Done as a single `UPDATE` per old status.
5. Migrate `locationAccuracy → locationSource`: `high/medium → exif`,
   `low → manual` (heuristic), `unknown → unknown`.
6. Run `bun run db:push` (destructive in dev — for the hackathon this
   is fine since there is no production data). Add a Vitest test that
   asserts every existing test fixture report ends up in the expected
   new status.

Because the sandbox DB has no production data, we use
`db:push --accept-data-loss` rather than a multi-step migration. The
migration script is preserved in `prisma/migrations/` for
documentation but not run in the sandbox.

## 6. Data Flow Diagrams (Text)

### 6.1 Upload + Analyze (happy path)

```
[Contributor browser]
  --POST /api/reports (event id, file)-->
[Next.js /api/reports route handler]
  --requireUser()-->
  --storage.save(file)-->  [uploads/<eventId>/<reportId>.jpg, .thumb.jpg, EXIF read]
  --db.report.create({status:'uploaded', locationSource:'unknown'})-->
  --writeAuditLog(UPLOAD)-->
  --return { reportId, exif }-->
[Contributor browser: location confirm]
  --PATCH /api/reports/[id]/location ({lat,lng,locationSource})-->
[Next.js route handler]
  --canMutateReport(user, report)-->
  --db.report.update-->
  --db.report.update({status:'analyzing'})-->
  --ai.museSpark.analyze(imagePath, prompt)-->
  [Muse Spark / z-ai VLM]
  <--raw output--
  --ai.schema.parse(raw)-->
  --if valid:
      db.analysis.create({...parsed})
      db.report.update({status:'needs_review'})
      writeAuditLog(ANALYZE)
      return { summary }
  --if invalid:
      db.report.update({status:'needs_manual_review', lastError})
      return { error }
  --if transient:
      db.report.update({status:'retryable_error', retryCount+1, lastError})
      schedule retry
      return { retrying }
```

### 6.2 Review (happy path)

```
[Reviewer browser: Review Queue]
  --GET /api/reports?status=needs_review,needs_manual_review-->
[Next.js /api/reports route handler]
  --requireRole([REVIEWER, ADMIN])-->
  --db.report.findMany({ where: {...}, include: { analysis: true }})-->
  <--list-->
[Reviewer browser: opens a report, picks action]
  --POST /api/reports/[id]/review ({action, comment?, overrides?})-->
[Next.js route handler]
  --requireRole([REVIEWER, ADMIN]) + canActOnReview(user)-->
  --db.$transaction([
       reviewAction.create,
       report.update({status:'reviewed', reviewOutcome, ...overrides}),
       auditLog.create({action:'REVIEW'}),
     ])-->
  <--{ updatedReport }-->
[Reviewer browser: sees the report leave the queue]
```

### 6.3 Map

```
[Any authenticated browser: Incident Map view]
  --GET /api/reports?status=reviewed&onMap=true-->
[Next.js route handler]
  --requireUser()-->
  --db.report.findMany({
     where: { status:'reviewed',
              reviewOutcome: { in: ['confirmed','flagged','resolved'] },
              locationSource: { not: 'unknown' } },
     include: { analysis: true } })-->
  --priority.compute(report, analysis) for each-->
  <--list with priorityScore-->
[Browser: MapLibre renders clustered pins]
```

## 7. Deployment Topology

### 7.1 Sandbox (development)

- One process: `next dev -p 3000` (Turbopack).
- One database: `file:/home/z/my-project/db/custom.db` (SQLite).
- One image store: `/home/z/my-project/uploads/`.
- One AI provider: `z-ai-web-dev-sdk` VLM (server-only).
- One external endpoint: the sandbox preview proxy at
  `https://preview-<bot-id>.space-z.ai/`.

### 7.2 Production (Phase 6 stretch)

- One deploy: Vercel (Next.js native).
- One database: Postgres (Vercel Postgres, Neon, or Supabase).
- One image store: S3 or Supabase Storage.
- One AI provider: Meta Muse Spark (key in Vercel env vars).
- Optional: a CDN in front of Vercel for static assets.

The single-process architecture is preserved. Vercel's serverless
functions replace the long-running dev server, but the code shape is
identical — route handlers in `src/app/api/**` deploy as serverless
functions automatically.

## 8. Cross-Cutting Concerns

### 8.1 Error Handling

Every route handler follows the same shape:

1. `requireUser()` or `requireRole([...])` — throws `AuthError` on
   failure, caught by a wrapping try/catch that returns 401 or 403
   with a structured error body `{ error: { code, message }}`.
2. Input validation with Zod — on failure returns 400 with the
   flattened Zod errors.
3. Business logic — wrapped in a try/catch that returns 500 on
   unexpected errors and 409 on conflict (e.g., optimistic
   concurrency). All unexpected errors are logged to the audit log
   with action `STATUS_CHANGE` and metadata `{ error: message }`.
4. Success returns 200 with the JSON body.

### 8.2 Logging

- **Audit log** (Prisma `AuditLog` table) — security-relevant events.
  Append-only, never cascade-deleted.
- **Server console** (`console.log/error` to `dev.log`) — dev-only
  diagnostics. Stripped in production build via a `lib/log.ts` wrapper
  that no-ops in `NODE_ENV=production`.

### 8.3 Testing

- **Unit** (Vitest, jsdom): pure functions in `src/lib/` — authz rules,
  priority computation, Zod schema parse/reject, bcrypt round-trip.
- **Integration** (Vest, jsdom + Prisma test DB): route handlers
  invoked with mocked `getServerSession` — verifies the authz,
  audit, and DB write in one shot. Added in Phase 4.
- **End-to-end** (Playwright, stretch O9): the three-minute demo
  script in `BUILD_PLAN.md` §8, automated. Added in Phase 6 if time
  permits.
