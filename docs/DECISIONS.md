# TerraResponse AI — Architecture Decision Records

> Companion to `PRODUCT_SCOPE.md`, `ARCHITECTURE.md`, `SECURITY.md`,
> and `BUILD_PLAN.md`. This document records the non-obvious
> architectural and design choices, with rationale and consequences.
> Each ADR follows the lightweight template:
> **Context · Decision · Consequences · Reversibility · Status**.
> Decisions are numbered; superseded decisions keep their number
> with a "Superseded by ADR-NNN" note.

## ADR-001: Next.js single-process (no separate backend service)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The TerraResponse AI platform needs to render pages, expose a JSON
API, perform database I/O via Prisma, store uploaded images, and
call a vision model server-side. A common architecture is to put a
separate backend service (Express, Fastify, NestJS) behind a
Next.js frontend, with the backend owning the API and the AI calls.
This is the conventional "front-end + back-end" split.

### Decision

Use Next.js App Router as the **single server**. Route handlers in
`src/app/api/**` are the API. Server components render pages. The
library layer in `src/lib/` is server-only. No separate backend
service is built for the MVP.

### Consequences

- **Pro**: one deploy, one set of secrets, one auth boundary, one
  Prisma connection pool, one place to read logs.
- **Pro**: the same `requireUser` / `requireRole` helpers are
  reused across server components and route handlers, eliminating
  the chance of an authz drift between two services.
- **Pro**: the AI SDK and Prisma client are imported only in
  server code; the Next.js bundler enforces this at build time.
- **Con**: a single process means the AI call (5–10 s) shares an
  event loop with page rendering. For the MVP this is fine; for
  production at scale we'd want the AI call in a separate worker.
- **Con**: serverless deployment (Vercel) treats each route handler
  as a separate function — fine, but means no in-process
  long-running state. The retry poller (Phase 3) would need to be
  an external worker (e.g., Vercel Cron + a queue).

### Reversibility

High. If we need to scale AI inference separately, the route
handlers in `/api/reports/[id]/analyze` can be lifted into a
separate service without touching the client. The library layer
(`src/lib/ai/`) is already isolated.

---

## ADR-002: NextAuth Credentials + JWT (vs. Supabase Auth)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The user's brief calls for Supabase Auth + PostgreSQL + RLS. The
sandbox does not ship Supabase (no external service, no API keys).
We need an equivalent auth solution that works locally.

### Decision

Use NextAuth v4 with the Credentials provider, backed by the Prisma
`User` table with bcrypt-hashed passwords. Sessions are JWT-based
(strategy `jwt`, maxAge 8h). Role-based authorization is enforced at
the application layer in `src/lib/authz.ts` (RLS-equivalent), since
SQLite has no RLS.

### Consequences

- **Pro**: no external service; works offline in the sandbox.
- **Pro**: the role propagates from JWT → session → typed
  `useSession()`, giving the client a typed user object without a
  second round-trip.
- **Pro**: the `verifyPassword` helper and the `DUMMY_HASH`
  constant give a constant-time user-enumeration mitigation that is
  unit-testable (regression guard in `auth.test.ts`).
- **Con**: JWT is stateless; sign-out invalidates the client-side
  session but the JWT remains valid until expiry. For the MVP this
  is acceptable. Production should add a session adapter with
  revocation.
- **Con**: Credentials provider requires self-managed password
  hashing. We use bcrypt cost 10 — verified by a unit test that
  checks the hash format and the round-trip.
- **Con**: no built-in social login, password reset, or email
  verification. These are post-MVP (`PRODUCT_SCOPE.md` §5 O4).

### Reversibility

Medium. Migrating to Supabase Auth in production is a schema
migration (add Supabase user id) and an `authOptions` swap. The
role-on-Session shape stays the same. The application-layer authz
rules are unaffected because they consume `session.user.role`
regardless of provider.

---

## ADR-003: Prisma + SQLite for the MVP (vs. Postgres/Supabase)

**Status**: Accepted
**Date**: 2026-10-27

### Context

Production will use Postgres (via Supabase or Vercel Postgres). The
sandbox needs a database that works without external setup.

### Decision

Use Prisma + SQLite (file at `db/custom.db`) for the MVP. The
`datasource` is `sqlite`; production swaps to `postgresql` — a
one-line change in `prisma/schema.prisma`. SQLite has no native
enum type, so enum-like fields are stored as `String` with the
union type enforced at the TypeScript layer in `src/lib/types.ts`.

### Consequences

- **Pro**: zero-setup database; the file lives in the repo
  (`db/custom.db`).
- **Pro**: Prisma's schema language is the same for SQLite and
  Postgres; the migration is mechanical.
- **Con**: no concurrent writes at scale. SQLite locks the whole
  file on write. For the hackathon MVP (one or two demo users) this
  is fine.
- **Con**: no RLS. We compensate with application-layer authz
  (`authz.ts`).
- **Con**: no array column type. JSON-encoded fields
  (`Analysis.detectedCategories`, `Analysis.hazards`,
  `AuditLog.metadata`) are stored as `String` and parsed with
  `JSON.parse` in the read path. This is fine for SQLite; on
  Postgres we'd switch to `Json` columns.

### Reversibility

High. The migration is `prisma db push` against a Postgres URL;
Prisma regenerates the client. The application code is unchanged
because Prisma abstracts the SQL dialect.

---

## ADR-004: z-ai-web-dev-sdk VLM as the sandbox AI (vs. Meta Muse Spark directly)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The user's brief calls for Meta Muse Spark for image understanding.
The sandbox does not have a Meta API key or the Muse Spark SDK; it
ships `z-ai-web-dev-sdk` (a vision-language model) which is a
sandbox-side equivalent for the same capability: send an image, get
a structured description back.

### Decision

Abstract the AI provider behind `src/lib/ai/muse-spark.ts`. In the
sandbox, the wrapper calls `z-ai-web-dev-sdk`'s VLM. In production,
the same wrapper calls Meta Muse Spark. The wrapper's signature is
`analyze(imagePath): Promise<{ ok: true, raw, parsed } | { ok:
false, kind: 'transient' | 'permanent' | 'schema_invalid', error }>`
— the call sites don't care which provider answered.

### Consequences

- **Pro**: swapping providers is a one-file change; the call sites,
  the Zod schema (`src/lib/ai/schema.ts`), and the route handlers
  are unaffected.
- **Pro**: the `z-ai-web-dev-sdk` rule (server-only) is enforced by
  the bundler; the same rule applies to the Meta SDK in production.
- **Con**: the two providers may produce slightly different output
  shapes; the Zod schema is the contract that normalizes them.
  If a provider's output drifts, the schema rejects it and the
  report parks in `needs_manual_review` — a safe failure mode.
- **Con**: the `modelId` field on `Analysis` records which provider
  produced the output (`muse-spark-v1` vs `zai-vlm-1`), so the
  audit trail is provider-aware.

### Reversibility

High. The wrapper is the only file that imports the SDK. Swap
the import and the env var; everything else is unchanged.

---

## ADR-005: Application-layer RLS-equivalent (vs. database RLS)

**Status**: Accepted
**Date**: 2026-10-27

### Context

Production RLS in Postgres would enforce row-level access at the
database. SQLite has no RLS. Even on Postgres, RLS policies would
need to mirror the TypeScript rules, doubling the surface area for
bugs and making the authz harder to unit-test.

### Decision

Enforce row-level access in the application layer
(`src/lib/authz-rules.ts` — pure rules, unit-tested; `authz.ts` —
session-aware wrappers). The `reportReadWhere(user)` helper returns
a Prisma `where` clause that every `GET /api/reports*` route
handler spreads into its query. Mutations go through
`canMutateReport(user, report)`. Reviewer actions go through
`canActOnReview(user)` and the self-review check.

### Consequences

- **Pro**: pure rules are unit-testable in Vitest without a DB or
  Next.js context (14 tests in Phase 1).
- **Pro**: one source of truth for authz; the database enforces
  integrity but not access.
- **Con**: a route handler that forgets to call `reportReadWhere`
  leaks data. Mitigation: an integration test in Phase 4 that
  hits every `GET /api/reports*` endpoint with a reporter session
  and asserts no other-user rows are returned.
- **Con**: not defense-in-depth. A SQL injection (Prisma prevents
  these by default) would bypass the authz. Acceptable for the
  MVP given Prisma's parameterization.

### Reversibility

High. If we add Postgres RLS in production, the application-layer
rules stay as the first line of defense and the database RLS
becomes the second. The two layers would share the same role
model.

---

## ADR-006: Single-route SPA (vs. multi-route)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The sandbox fullstack-dev skill rules say: "User can only see the
`/` route defined in `src/app/page.tsx`. Do NOT write any other
route." A multi-route app (e.g., `/dashboard`, `/upload`,
`/review`, `/map`) is therefore not viable in the sandbox.

### Decision

Ship a single-route SPA. `src/app/page.tsx` is a server component
that wraps `<Providers><AppShell/></Providers>`. The `AppShell`
client component uses `useSession()` to switch between LoginCard
and the authenticated shell. Inside the shell, the active "view"
is local `useState`; the sidebar switches views without changing
the URL.

### Consequences

- **Pro**: meets the sandbox rule.
- **Pro**: no client-side router needed; smaller bundle.
- **Con**: no deep-linking — the URL is always `/`. A user who
  reloads the page returns to the default view for their role.
  Acceptable for the MVP; a future polish phase could add
  `?view=...` query state.
- **Con**: browser back button doesn't switch views. Acceptable
  for the MVP.

### Reversibility

High. If the sandbox rule is lifted, splitting into multi-route
is a refactor of `app-shell.tsx` into per-route `page.tsx` files;
the views themselves are already isolated.

---

## ADR-007: Local filesystem for image storage (vs. S3 / Supabase Storage)

**Status**: Accepted
**Date**: 2026-10-27

### Context

Production will use object storage (S3 or Supabase Storage) for
uploaded images. The sandbox has no object storage; the local
filesystem is the only option.

### Decision

Use `/home/z/my-project/uploads/<eventId>/<reportId>.<ext>` for
the sandbox. The `src/lib/storage.ts` interface (`save`, `read`,
`getStripped`, `getThumbnail`) is provider-agnostic; the
implementation swaps to S3 in production without changing call
sites. The route handler that serves images
(`/api/uploads/[id]`) reads from the local path in the sandbox
and from S3 in production.

### Consequences

- **Pro**: no external setup; works offline.
- **Pro**: the storage interface is the same; only the
  implementation swaps.
- **Con**: images don't survive a sandbox reset. For the demo we
  re-seed images via `scripts/seed-images.ts` if needed.
- **Con**: no CDN; image serving goes through the Next.js server.
  Fine for the MVP; production moves to a CDN fronting S3.

### Reversibility

High. The `storage.ts` interface is the contract; the
implementation is the only thing that changes.

---

## ADR-008: Report lifecycle with primary status + reviewOutcome

**Status**: Accepted
**Date**: 2026-10-27

### Context

The Phase 1 schema used an eight-status uppercase lifecycle
(`UPLOADED`, `ANALYZING`, `ANALYZED`, `IN_REVIEW`, `CONFIRMED`,
`FLAGGED`, `REJECTED`, `RESOLVED`). The user's brief for the
planning step specified a six-status lowercase lifecycle
(`uploaded`, `analyzing`, `needs_review`, `reviewed`,
`needs_manual_review`, `retryable_error`). The eight-status model
conflates two axes — workflow state and reviewer outcome — into
one field, which makes queries and the state machine awkward.

### Decision

Adopt the user's six-status model as the primary `status` field.
Add a separate nullable `reviewOutcome` field on `Report` that
holds the reviewer's decision (`confirmed`, `flagged`, `rejected`,
`resolved`) and is set when `status` transitions to `reviewed`.
Status names are stored as lowercase strings in the database
(matching the user's brief). The Phase 1 uppercase values are
migrated per `ARCHITECTURE.md` §5.8.

### Consequences

- **Pro**: the state machine is cleaner — six states with clear
  transitions, no overlap.
- **Pro**: queries are simpler: "all confirmed incidents" is
  `status: 'reviewed', reviewOutcome: 'confirmed'` (or the
  shorthand `?onMap=true`).
- **Pro**: the `ReviewAction.previousStatus` and `newStatus`
  fields stay meaningful — they record a transition into
  `reviewed` plus the outcome.
- **Con**: one extra column. Negligible.
- **Con**: a Phase 2 migration is required. Acceptable — there is
  no production data.

### Reversibility

Medium. Reverting to the eight-status model is a destructive
migration; not worth doing. The new model is strictly better.

---

## ADR-009: Event-scoped reports (vs. flat report list)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The Phase 1 schema has no concept of an "incident event." The
user's brief for the planning step explicitly requires:
"sign in → **select incident event** → upload image → ...". This
implies an Event entity that reports belong to.

### Decision

Add an `Event` model and a required `eventId` FK on `Report`. Every
report belongs to exactly one event. Events are admin-created ahead
of time (e.g., "Hurricane Helene — Asheville"). The contributor
picks an active event from a dropdown on the upload form. The map
view can be filtered by event.

### Consequences

- **Pro**: matches the user's brief; groups related reports.
- **Pro**: per-event cost controls (`aiCallBudget`,
  `aiCallCount`) are natural — cost is bounded per disaster, not
  globally.
- **Pro**: the `EventMember` extension point (per-event
  membership) is built into the schema even though it's not
  enforced in the MVP.
- **Con**: every existing Phase 1 `Report` needs an `eventId` —
  the migration creates a default `unassigned` event and assigns
  all existing reports to it (`ARCHITECTURE.md` §5.8 step 3).
- **Con**: one more dropdown on the upload form. Worth it.

### Reversibility

Low. Removing events after building on them is a destructive
migration. Not worth doing; the event concept is in the user's
brief.

---

## ADR-010: SAM 3.1 as opt-in, not automatic

**Status**: Accepted
**Date**: 2026-10-27

### Context

SAM 3.1 segmentation masks add cost (a second model call) and
visual value (the affected region highlighted). Running SAM on
every report would double the AI cost; running it on no report
would waste the capability.

### Decision

SAM 3.1 segmentation is **opt-in per report**, triggered by an
explicit reviewer action ("Generate mask"). It is never invoked
automatically by the upload or analyze flow. It has its own
per-event budget (`samCallBudget`, default 50) separate from the
main AI budget. The reviewer sees the current spend next to the
button.

### Consequences

- **Pro**: cost is bounded — SAM runs only when a reviewer asks
  for it.
- **Pro**: the feature is gracefully optional — cutting it
  (Phase 5.5) just removes the button; the rest of the app is
  unaffected.
- **Con**: a reviewer who wants masks on every report has to click
  for each one. Acceptable; masks are not always useful.

### Reversibility

High. The SAM route is one endpoint; cutting it is deleting the
route and the button.

---

## ADR-011: AI raw output kept server-side only

**Status**: Accepted
**Date**: 2026-10-27

### Context

The vision model's raw response may contain prompt-injected text,
malformed JSON, or provider-specific shape that we don't want to
expose to the client. The validated structured summary is the
contract.

### Decision

Store the raw response in `Analysis.rawOutput` (server-side only).
Every client-facing Prisma query that returns analysis data uses
`select: { ... }` and **omits** `rawOutput`. The route handlers
return only the parsed fields. An integration test in Phase 3
greps the response body for a known raw-output literal and asserts
it is absent.

### Consequences

- **Pro**: bounds the prompt-injection surface area — the model's
  raw text never reaches the browser.
- **Pro**: the client sees a stable contract regardless of
  provider.
- **Con**: debugging requires server-side access to `rawOutput`.
  Acceptable — the audit log captures the `ANALYZE` action with
  the parsed fields; the raw output is preserved on disk for
  post-incident review.

### Reversibility

Medium. Exposing raw output is a one-field change in the `select`
clause; the integration test would catch the regression.

---

## ADR-012: Audit log not cascade-deleted with users

**Status**: Accepted
**Date**: 2026-10-27

### Context

When a user is deleted, the audit trail of their actions should
survive. A cascade delete would erase the history; an audit log
that lies about who did what is worse than no audit log.

### Decision

The `AuditLog.actor` relation uses `onDelete: SetNull`. When a
user is deleted, their audit log rows have `actorId` set to null
but the rows themselves stay. The `action`, `metadata`, `ip`, and
`userAgent` fields are preserved. The audit log is append-only —
no `UPDATE` or `DELETE` route handler exists; this is verified by
a grep test in Phase 6.

### Consequences

- **Pro**: the audit trail survives user churn.
- **Pro**: compliance-friendly — the trail can answer "who did
  what, when" even after the actor leaves.
- **Con**: the `actor` relation is nullable; reads must handle
  null. Minor.

### Reversibility

Low. Changing the delete behavior would lose history. Not worth
doing.

---

## ADR-013: Vitest (vs. Jest) for unit tests

**Status**: Accepted
**Date**: 2026-10-27

### Context

The user's brief lists Vitest for tests. Jest would also work but
adds config overhead and is slower for Vite-based projects.

### Decision

Use Vitest with the jsdom environment. Config in
`vitest.config.ts`. Tests live next to source as `*.test.ts`.
Coverage is collected on `src/lib/**/*.ts`.

### Consequences

- **Pro**: fast — Vitest reuses Vite's transform pipeline.
- **Pro**: jsdom environment for React component tests without
  extra setup.
- **Pro**: the `@/` alias matches the Next.js tsconfig `paths`.
- **Con**: the `isolatedModules` setting in tsconfig means some
  type-only imports need `import type`. Minor.

### Reversibility

High. Tests are framework-agnostic at the assertion level;
swapping to Jest is a config change.

---

## ADR-014: MapLibre GL JS (vs. Mapbox / Leaflet)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The user's brief calls for MapLibre GL JS. Mapbox GL JS is the
commercial fork; Leaflet is older and lacks vector-tile
performance.

### Decision

Use `maplibre-gl` (installed in Phase 1). The Incident Map view
renders clustered pins, severity-colored, with a side panel on
pin click. Map tiles come from a free raster source (OpenStreetMap
raster tiles or a self-hosted tile server) — no API key required
for the demo.

### Consequences

- **Pro**: open-source, no vendor lock-in, no API key needed.
- **Pro**: vector-tile performance is good for thousands of pins
  (we have tens).
- **Con**: the map needs a tile source. For the demo we use OSM
  raster tiles with attribution; for production we'd use a
  self-hosted tile server or Mapbox's commercial tiles.
- **Con**: the bundle is larger than Leaflet. Acceptable.

### Reversibility

Medium. The map component is isolated; swapping to Leaflet is a
rewrite of one file.

---

## ADR-015: shadcn/ui (vs. MUI / Ant Design / Chakra)

**Status**: Accepted
**Date**: 2026-10-27

### Context

The sandbox ships shadcn/ui (New York style, Tailwind v4). The
user's brief calls for shadcn/ui. MUI and Ant are heavier and
ship their own styling system that fights Tailwind.

### Decision

Use shadcn/ui for all UI components. The components live in
`src/components/ui/` (scaffolded by the sandbox). Custom TerraResponse
components live in `src/components/terra/` and `src/components/views/`.

### Consequences

- **Pro**: consistent styling, Tailwind-native, no theme conflict.
- **Pro**: components are owned by the repo (not a black-box
  dependency) — easy to extend.
- **Con**: each component is a file in the repo, increasing the
  file count. Acceptable; they're small and well-named.

### Reversibility

High. Components are isolated; swapping is a per-component
rewrite.

---

## ADR-016: Inline AI analysis (vs. background queue) for the MVP

**Status**: Accepted
**Date**: 2026-10-27

### Context

The AI call takes 5–10 s. Two options: (a) inline — the upload
handler triggers the AI and returns when it's done, browser shows
a spinner; (b) background — the upload handler returns
immediately, a poller runs the AI asynchronously, browser polls
for status.

### Decision

Start with inline (option a). The `PATCH /api/reports/[id]/location`
handler triggers the AI and waits. If the model latency exceeds
30 s in testing, switch to background (option b) with an
in-process `setInterval` poller in a mini-service on a separate
port (per the fullstack-dev skill's mini-service pattern). The
retry poller for `retryable_error` is also a mini-service.

### Consequences

- **Pro**: simpler code; no polling on the client.
- **Pro**: the user sees the AI result immediately on submit.
- **Con**: the upload request blocks for ~10 s. Acceptable for a
  demo; production would use background.
- **Con**: if the AI is slow, the user sees a long spinner. The
  UI shows "Analyzing… (this can take up to 30 seconds)" so the
  user knows to wait.

### Reversibility

High. The route handler can be split into "create" + "analyze"
endpoints if we switch to background; the client polls
`GET /api/reports/[id]`.

---

## Summary

The 16 ADRs above fix the architecture for the MVP. They are
deliberately conservative: each one minimizes external
dependencies, maximizes unit-testability, and preserves an
extension point for the post-MVP features in `PRODUCT_SCOPE.md`
§5. The decisions are documented here so that future agents (or
the user) can revisit any choice with full context.
