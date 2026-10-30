# TerraResponse AI — Security

> Companion to `PRODUCT_SCOPE.md` and `ARCHITECTURE.md`. This document
> fixes the security and privacy boundaries for the MVP. The fixed
> safety boundaries in `PRODUCT_SCOPE.md` §7 are the non-negotiable
> subset; this document expands them with implementation detail,
> threat model, and verification.

## 1. Authentication

### 1.1 Provider

Authentication uses NextAuth v4 with the Credentials provider. The
sandbox has no Supabase Auth, so we use email + password against the
Prisma `User` table with bcrypt-hashed passwords. The choice is
recorded in `DECISIONS.md` ADR-002. Self-signup is **not** supported in
the MVP (`PRODUCT_SCOPE.md` §5 O4); demo accounts are seeded via
`scripts/seed.ts`.

### 1.2 Password Storage

Passwords are hashed with bcrypt at cost factor 10. The hash format is
verified in `src/lib/auth.test.ts` — every stored hash starts with
`$2a$` or `$2b$` and is 60 characters. The seed script and the auth
layer use the same cost factor, so login and signup (when added) share
the same security baseline.

The bcrypt salt is random per password (16 bytes inside the hash), so
two users with the same password have different hashes. This is
verified by a unit test that hashes the same password twice and
asserts the hashes differ but both verify.

### 1.3 Constant-Time User-Enumeration Mitigation

A naive Credentials provider returns quickly when the email doesn't
exist in the database and slowly when it does (because bcrypt.compare
takes ~70 ms at cost 10). That timing difference lets an attacker
enumerate valid emails. Phase 1's first review found and fixed a bug
where the fallback hash was malformed and returned in 0 ms; the fix
is locked in by a regression test (`src/lib/auth.test.ts` — "takes
comparable time for null vs real-hash with wrong password").

The mechanism: a `DUMMY_HASH` constant is pre-computed once at
module load via `bcrypt.hashSync(...)` and is a valid 60-character
bcrypt hash. The `verifyPassword(candidate, userHashOrNullOrUnknown)`
helper routes non-existent-user attempts through `bcrypt.compare(
candidate, DUMMY_HASH)`, incurring the same ~70 ms cost as a real
wrong-password attempt. The helper is exported so the security
property is unit-testable without spinning up Prisma or NextAuth.

### 1.4 Session Strategy

Sessions are JWT-based (NextAuth `strategy: 'jwt'`, `maxAge: 60 * 60
* 8` — 8 hours). The JWT is signed with `NEXTAUTH_SECRET` (a 32-byte
base64 random value generated at init time and stored in `.env`).
The JWT contains `id`, `email`, `name`, and `role`. The `role` is
propagated to the client `Session` via the `jwt` → `session`
callbacks so `useSession()` returns a typed `{ id, email, name, role }`
user object.

Trade-off: a JWT strategy is stateless, which means sign-out
invalidates the client-side session but the JWT itself remains valid
until expiry. For an MVP this is acceptable. Production should add a
session adapter with revocation (`DECISIONS.md` ADR-002).

### 1.5 Login Failure Handling

Every failed login attempt is recorded in the `AuditLog` table with
action `AUTH_FAILED`, the supplied email in `metadata`, the IP
(first from `x-forwarded-for`), and the user-agent. The
`actorId` is the user's id if the email exists, or `null` if it
doesn't — this preserves the audit value without leaking the
existence of the email to anyone reading the log.

Successful logins are recorded with action `LOGIN`. Sign-outs are
recorded with action `LOGOUT` (added in Phase 4 alongside the audit
log UI).

## 2. Authorization (RLS-Equivalent)

### 2.1 Role Model

Three global roles stored on `User.role` (a `String` since SQLite
has no native enum; the union is enforced in `src/lib/types.ts`):

- `REPORTER` — contributor. Can upload, view and mutate their own
  reports that have not entered review.
- `REVIEWER` — can do everything a `REPORTER` can, plus read all
  reports, act on the Review Queue, read the Audit Log.
- `ADMIN` — can do everything a `REVIEWER` can, plus create/close/
  archive events, manage cost controls, act on any report regardless
  of status.

### 2.2 Row-Level Access Rules

Authorization is enforced at the application layer in
`src/lib/authz-rules.ts` (pure rules, unit-tested) and
`src/lib/authz.ts` (session-aware wrappers). The sandbox has no
Supabase/Postgres RLS, so the rules are the only enforcement. They
are equivalent to RLS policies on the `reports` table:

| User role | Can read | Can mutate | Can review |
|---|---|---|---|
| REPORTER | own reports only | own reports in `uploaded` / `analyzing` only | no |
| REVIEWER | all reports | no (cannot edit content) | yes (on reports in `needs_review` / `needs_manual_review`) |
| ADMIN | all reports | yes (any report, any status) | yes |

The `reportReadWhere(user)` helper returns a Prisma `where` clause
that encodes this: `{}` for `ADMIN`/`REVIEWER` (all rows) or
`{ reporterId: user.id }` for `REPORTER`. Every `GET /api/reports*`
route handler must call this and spread the result into its
`where` clause. This is verified by an integration test in Phase 4.

### 2.3 Denials Are Audited

`requireRole(allowed)` records a `PERMISSION_DENIED` audit entry on
denial with the actor id, the required roles, and the actual role.
This makes privilege escalation attempts traceable. The audit
write is wrapped in `.catch(() => undefined)` so a failure to write
the audit log doesn't prevent the denial from being enforced (the
denial throws regardless; the audit is best-effort).

### 2.4 Event-Scoped Access (Post-MVP Extension)

The `EventMember` table (`ARCHITECTURE.md` §5.3) is created in
Phase 2 but not enforced in the MVP. When enforcement is added
(post-MVP), `requireRole(allowed, eventId)` will consult
`EventMember` first and fall back to the global role. The current
`requireRole` signature already takes the optional `eventId` slot
in the design, so the extension doesn't break the call sites.

## 3. Privacy Boundaries

The platform handles potentially sensitive content: photos of
disaster scenes that may include identifiable people, damaged
homes, and the contributor's location. Privacy boundaries:

### 3.1 Evidence Records Are Private Until Reviewed

A `Report` row with status in `uploaded` / `analyzing` /
`needs_review` / `needs_manual_review` / `retryable_error` is
visible only to:

- The contributor who created it (via `reportReadWhere`).
- Any `REVIEWER` or `ADMIN` (via `reportReadWhere` returning `{}`).

It is **never** returned by the public map endpoint
(`/api/reports?status=reviewed&onMap=true`), which filters to
`status: 'reviewed'` and `reviewOutcome: { in: ['confirmed',
'flagged', 'resolved'] }`.

### 3.2 EXIF GPS Handling

- The browser **never** receives the raw EXIF GPS. EXIF is read
  server-side in `storage.ts` and the values are returned to the
  contributor as a suggested pin location, which they confirm,
  correct, or replace with `unknown`.
- The reviewer sees only the **confirmed** location (the value the
  contributor chose). The reviewer does not see the raw EXIF.
- The public map sees only the confirmed location, and only for
  reports with `locationSource != 'unknown'`.
- Any image served to a non-contributor has EXIF stripped
  (`storage.ts` produces a `.stripped.<ext>` copy for reviewer
  view; the original with EXIF is never served outside the
  contributor's own profile view).

### 3.3 Original Filenames Are Discarded

Uploaded files are stored as `uploads/<eventId>/<reportId>.<ext>`.
The original filename provided by the browser is **not** preserved
on disk or in the database. Filenames can leak PII (e.g.,
`john_smith_house_backyard.jpg`); discarding them removes that
leak. The `Report` model has no `originalFilename` field by
design.

### 3.4 AI Raw Output Is Server-Side Only

The `Analysis.rawOutput` field stores the model's complete raw
response for debugging and audit. It is **never** returned to the
client. The route handlers that return analysis data
(`/api/reports/[id]`, `/api/reports?...`) return only the parsed
fields (`caption`, `detectedCategories`, `hazards`,
`severityScore`, `confidence`, `peopleVisible`, `schemaVersion`).
This bounds the surface area for prompt-injection leakage (see
§6.2).

### 3.5 PII Minimization

The platform collects only:

- The contributor's email and an optional display name (at
  signup / seed time).
- The contributor's IP and user-agent (in the audit log, server-side
  only — never returned to the client).
- The photo and its confirmed location.

It does **not** collect: real name (the `name` field is optional and
defaults to the role label), phone number, home address, government
id, demographic data, or any third-party PII.

### 3.6 Audit Log Visibility

The audit log is readable only by `REVIEWER` and `ADMIN`. The
`/api/audit` route handler calls `requireRole(['REVIEWER', 'ADMIN'])`
before returning any rows. The audit log is never writable from the
client — `writeAuditLog` is a server-only function in
`src/lib/audit.ts`.

## 4. Audit Logging

Every security-relevant action is recorded in the `AuditLog` table.
The table is append-only — there is no `UPDATE` or `DELETE` route
handler for it. The `actor` relation uses `onDelete: SetNull` so
the audit trail survives user deletion.

The action union (`src/lib/types.ts`):

| Action | When |
|---|---|
| `LOGIN` | Successful sign-in |
| `LOGOUT` | Sign-out (Phase 4) |
| `AUTH_FAILED` | Failed sign-in (wrong password or non-existent email) |
| `UPLOAD` | A new Report is created |
| `ANALYZE` | AI analysis completes (success or schema-invalid) |
| `REVIEW` | A reviewer takes an action on a report |
| `DELETE` | A report is deleted |
| `STATUS_CHANGE` | A report's status changes outside of REVIEW/ANALYZE (e.g., retry) |
| `PERMISSION_DENIED` | A `requireRole` denial |
| `REGISTER` | A new user is created (post-MVP, when self-signup is added) |

Every entry includes the actor id (or null for system actions),
the target id (report id, user id, etc.), JSON-encoded metadata,
the IP (first from `x-forwarded-for`, single value — never the full
chain), and the user-agent. The `writeAuditLog` helper captures
the IP and user-agent from `next/headers` when invoked in a
request context, and gracefully no-ops the header read when
invoked outside a request (so the helper can be used in scripts
and tests).

## 5. Rate Limiting & Abuse Prevention

The platform is exposed to the public internet (via the sandbox
preview proxy). Abuse vectors and mitigations:

| Vector | Mitigation |
|---|---|
| Brute-force login | Per-account rate limit enforced in a Next.js middleware (or in a wrapping route handler around `next-auth`'s callback) — a rolling-window count of `AUTH_FAILED` audit entries per email + IP. **Note:** NextAuth v4's Credentials provider has no built-in rate limit; we implement our own. Configurable via the `LOGIN_RATE_LIMIT_PER_HOUR` env var (default 10 attempts/hour). Phase 4 adds the middleware. |
| Mass upload | Per-user upload rate limit: 20/hour, enforced in the `/api/reports` POST route handler via a rolling window count over `db.report.count({ where: { reporterId, createdAt: { gte: oneHourAgo } } })`. |
| Image bomb (huge image) | Server-side size cap (10 MB) and dimension cap (8000×8000) enforced in `storage.ts` before the file is written. |
| Image bomb (decompression) | `sharp` is used to re-encode the image to a normalized JPEG before storage, defeating decompression-ratio attacks. |
| AI cost runaway | Per-event `aiCallBudget` (default 500) enforced in the analyze route handler. `aiCallCount` is incremented atomically in a transaction. When `aiCallCount >= aiCallBudget`, the analyze route returns 402 with a "budget exhausted" error and the report is parked in `needs_manual_review`. |
| Prompt injection via image | Mitigated by the fixed system prompt in `src/lib/ai/prompt.ts` (§6.2) and by parsing the output against the Zod schema, which rejects out-of-enum categories. |
| Audit log spam | The audit log is server-write-only; the client cannot create entries. |
| Reviewer mass-confirm | Each review action is one row; an admin can see the per-reviewer action count in the dashboard (Phase 5). |

Rate limits are **not** a Phase 1 concern; they are added in Phase 2
(upload rate, image caps) and Phase 3 (AI budget).

### 5.1 Phase 12 — Resilience & cost-control extensions

Phase 12 added the following server-enforced ceilings, all
configurable via env (see `.env.example` for the full list):

| Vector | Mitigation |
|---|---|
| Daily AI spend runaway | `AI_DAILY_SPEND_CEILING_USD` (default $50). The analyze route refuses (402) when the UTC-day SUM of `ai_usage_log.estimated_cost_usd` reaches the ceiling. The admin `/api/admin/ai-usage` endpoint shows the current spend vs. the ceiling. |
| Daily AI request count runaway | `AI_DAILY_REQUEST_CEILING` (default 1000). Same mechanism; counts `ai_usage_log` rows for the UTC day. |
| Per-event AI budget | `AI_PER_EVENT_BUDGET` (default 500). Counts `ai_usage_log` rows for the event (all-time). Replaces the earlier in-memory counter with a durable DB-backed count. |
| Per-user AI call rate | `AI_PER_USER_CALLS_PER_HOUR` (default 30). Counts `ai_usage_log` rows for the user in the last hour. The brief: "per-user and per-event server-enforced rate limits." |
| Per-user signed-URL mint rate | `SIGNED_URL_RATE_LIMIT_PER_MIN` (default 60). Counts `evidence_signed_url_log` rows for the user in the last minute. Without this, a user could mint thousands of 60s URLs and overload storage. |
| Endless retry loop (manual re-analyze) | The manual re-analyze button is capped at `MAX_MANUAL_RETRIES = 5` (the brief's "5 attempts"). Past the cap, the analyze route parks the report in `needs_manual_review` instead of invoking the model. See `src/lib/ai/safe-retry.ts`. |
| Endless retry loop (automated backoff) | The `withRetry` loop in `src/lib/ai/retry.ts` is capped at `AI_MAX_RETRIES = 4` (5 total attempts) with exponential backoff (2s, 4s, 8s, 16s). |
| Model call hangs | `AI_CALL_TIMEOUT_MS` (default 30000). The Meta Model API call is aborted via `AbortController` after this many ms; the bounded retry loop then retries with backoff. See `src/lib/ai/muse-spark.ts`. |
| Repeated cost on identical re-uploads | The dedup cache (`src/lib/ai/dedup-cache.ts`) reuses the existing `report_analyses` row when the same SHA-256 is uploaded again in the same event. NO model call, NO cost. The cache reads the CURRENT structured_observation (reviewer corrections are preserved). |
| Silent failures | Every ceiling violation, every AI call (success + every failure kind), and every signed-URL mint is logged to `ai_usage_log` or `evidence_signed_url_log`. Failures are NEVER silent — `console.error` writes the sanitized error to the platform logs. |
| Cost telemetry gaps | The `ai_usage_log` row records: `model_id`, `prompt_version`, `schema_version`, `provider_request_id` (when available), `prompt_tokens` / `completion_tokens` / `total_tokens` (when the provider returns them), `latency_ms`, `estimated_cost_usd` + `cost_basis`, `outcome`, `failure_kind`, a SHORT SANITIZED `error_message` (capped at 200 chars; JWTs/API keys/base64 blobs redacted). NO secrets, NO image bytes, NO raw model response text. |

The cost-control modules are pure (no I/O, no DB) so they're fully
unit-testable. See `src/lib/ai/cost-controls.ts`, `src/lib/rate-limit.ts`,
`src/lib/ai/usage-log.ts`, `src/lib/ai/dedup-cache.ts`,
`src/lib/ai/safe-retry.ts`. The rate-limit module queries Supabase
via the SSR client (RLS-enforced); on a count-query failure, the
limit is BYPASSED (fail-open) and the failure is logged — a DB
hiccup shouldn't block a legitimate upload. The ceilings enforce
when the count works.

### 5.2 Phase 12 — Private-photo retention & signed-URL workflow

Phase 12 added the retention workflow (`src/lib/storage/retention.ts`):

```
active       → soft_deleted → purged
                 ↑              ↑
                 |              |
   POST /api/reports/[id]/retention       (admin or scheduled purge,
   (contributor or event reviewer+)        after RETENTION_WINDOW_DAYS=7)
                                          POST /api/reports/[id]/retention?purge=1

   DELETE /api/reports/[id]/retention   ← revoke soft-delete (only the
   (original requester or admin)          original requester or admin;
                                          storage objects were NOT deleted)
```

- The signed-URL endpoint (`GET /api/reports/[id]/evidence`) refuses
  to mint URLs for `soft_deleted` or `purged` reports (410 GONE).
- The signed-URL TTL is 60 seconds (`SIGNED_URL_TTL_SECONDS`). The
  TTL is logged on `evidence_signed_url_log` so an auditor can verify.
- The purge order is ORIGINAL FIRST (the most sensitive — EXIF
  intact), then derivative, then thumbnail. If the original purge
  succeeds but the derivative purge fails, the original is ALREADY
  gone — the most sensitive object is removed even if the lower-
  sensitivity purge fails.
- The reports row is NEVER hard-deleted by the cleanup endpoint
  (the audit trail survives). Only an admin can hard-delete a report
  via SQL (out-of-band).
- The retention window is enforced server-side (the purge endpoint
  checks `retention_window_ends_at`). The `RETENTION_ADMIN_OVERRIDE=1`
  env unlocks admin early-purge.

### 5.3 Phase 12 — Prompt-injection defenses

Phase 12 added the prompt-injection sanitizer
(`src/lib/ai/prompt-injection.ts`). Defense-in-depth (4 layers):

1. **Structural** (PRIMARY): user-supplied text (title, description)
   is NEVER included in the prompt sent to the AI model. The system
   prompt is fixed; the only image input is the derivative. So even
   if the user writes "ignore previous instructions", the model
   never sees it.
2. **Length**: title ≤ 200 chars, description ≤ 5000 chars (Zod in
   `src/lib/api-schemas/reports.ts`).
3. **Content sanitization** (the new module): a pure function that
   flags and rewrites common prompt-injection patterns
   (`ignore previous instructions`, `you are now a ...`,
   `<|im_start|>`, `system:`, etc.) to `[redacted:possible-instruction]`
   BEFORE storing. The sanitized text is what's stored; the original
   text is NOT preserved.
4. **Audit**: when sanitization rewrites text, a `console.warn` is
   emitted server-side (the operator sees it in the platform logs).

The sanitizer is PURE: no I/O, fully unit-tested (see
`src/lib/ai/prompt-injection.test.ts` — 13 tests covering the
common patterns + benign-text passthrough).

### 5.4 Phase 12 — Safe handling of missing locations

Phase 12 added the missing-location resolver
(`src/lib/storage/missing-location.ts`). Rules:

1. `location_source = "unknown"` ⇔ coords MUST be null (the DB has
   a CHECK constraint; the resolver asserts it before the insert).
2. `location_source = "gps"` ⇔ coords MUST be set (from EXIF).
3. `location_source = "manual"` ⇔ coords MUST be set (from the
   user's pin).
4. When EXIF GPS is missing AND the user didn't pin a manual
   location, the report is stored with `location_source = "unknown"`
   and null coords. The server NEVER fabricates coordinates. The
   report appears in the "Unlocated" list/queue (with a `MapPinOff`
   icon) but NEVER on the map.
5. The user's choice wins: if the user explicitly says "I don't
   know the location" (source = "unknown"), the EXIF (if present)
   is discarded. The user's choice is the source of truth.

The resolver is PURE: no I/O, fully unit-tested (see
`src/lib/storage/missing-location.test.ts` — 13 tests).

## 6. AI Safety Boundaries (Fixed)

The fixed safety boundaries in `PRODUCT_SCOPE.md` §7 items 1–4 are
the non-negotiable AI rules. This section expands them with
implementation detail.

### 6.1 Never Automatically Dispatch Emergency Services

There is no API client for any dispatch system in the codebase.
There is no scheduled job that calls any external emergency service.
The platform's only outputs are: the in-app Review Queue, the
in-app Incident Map, the in-app Dashboard, and the in-app Audit Log.
A reviewer or admin reading these outputs decides what to do; the
platform does not act on their behalf.

This is enforced by code review (no `fetch` to external domains in
`src/lib/`) and by a grep test in Phase 6 that asserts no production
source file imports an HTTP client targeting an external domain
other than the configured AI provider.

### 6.2 Never Present AI Observations as Verified Findings

The UI labels are explicit:

- In the Review Queue, the AI section header reads **"AI preliminary
  result — pending human review"** with a yellow `PhaseBadge`. The
  reviewer's action buttons are labeled **"Confirm"** (the AI was
  right), **"Flag"** (unclear), **"Reject"** (not a disaster photo),
  **"Resolve"** (incident closed).
- On the Incident Map, pins show the **reviewer-confirmed** summary,
  not the AI summary. The pin tooltip includes the reviewer's name
  and the review timestamp.
- The Dashboard counts only `status: 'reviewed'` reports in
  "Confirmed incidents". Reports in `needs_review` are counted
  under "Pending review" only.

The system prompt sent to the vision model (`src/lib/ai/prompt.ts`)
instructs the model that its output is a preliminary observation for
human review, not a verified finding. This is a defense-in-depth
measure; the boundary is enforced in the UI regardless of what the
model outputs.

### 6.3 Prompt-Injection Mitigations

The vision model is given an image and a fixed system prompt that
asks for a structured JSON response with specific fields. The
contributor does not get to inject arbitrary text into the prompt.
The only contributor-controlled text is the optional `title` and
`description` on the Report; these are **not** included in the
prompt sent to the model. They are stored on the Report row and
shown to the reviewer separately.

The model's raw output is parsed against a Zod schema
(`src/lib/ai/schema.ts`) that:

- Validates the JSON structure.
- Constrains `detectedCategories` to a fixed enum (`flood`,
  `wildfire`, `structural_damage`, `debris`, `road_blockage`,
  `landslide`, `storm`, `other`).
- Constrains `severityScore` to `0 ≤ n ≤ 100` (integer).
- Constrains `confidence` to `0 ≤ n ≤ 1` (float).
- Constrains each hazard object's `type` to a fixed enum.
- Rejects any extra fields (strict mode).

A response that fails validation transitions the report to
`needs_manual_review` rather than `needs_review`. The reviewer
does the analysis by hand.

The 8-value `detectedCategories` enum is exercised at three
levels: the Zod schema unit test (`src/lib/ai/schema.test.ts`,
Phase 3) covers all 8 values (accept each valid value, reject
any other string); the integration test covers the happy path
with `flood`; the fixture images in `tests/fixtures/images/`
(`BUILD_PLAN.md` §5) cover the 5 most common categories
(`flood`, `wildfire`, `structural_damage`, `debris`,
`road_blockage`) end-to-end. The remaining 3 (`landslide`,
`storm`, `other`) are tested only at the schema level.

### 6.4 Never Expose AI Raw Output to the Client

`Analysis.rawOutput` is never selected in any client-facing Prisma
query. The route handlers that return analysis data use
`select: { caption: true, detectedCategories: true, hazards: true,
severityScore: true, confidence: true, peopleVisible: true,
schemaVersion: true }` (no `rawOutput`). This is verified by an
integration test in Phase 3 that greps the response body for the
literal text of a known raw output and asserts it is absent.

### 6.5 Never Run the AI Model on a Report a Second Time Automatically

A successful analysis is never re-invoked unless a reviewer
explicitly requests a re-analysis (a Phase 6 stretch affordance). The
`retryable_error` status retries with backoff, but a
`needs_review` or `reviewed` report is never re-analyzed. This
bounds the AI cost per report to one call (plus retries on
transient failure).

## 7. Credential & Secret Management

| Secret | Location | Exposed to client? |
|---|---|---|
| `NEXTAUTH_SECRET` | `.env` (sandbox), Vercel env var (prod) | No — read server-side by NextAuth |
| `DATABASE_URL` | `.env` (sandbox), Vercel env var (prod) | No — read server-side by Prisma |
| AI provider API key (Muse Spark / z-ai) | `.env` or Vercel env var | No — read server-side by `ai/muse-spark.ts` |
| `NEXTAUTH_URL` | `.env` (sandbox), Vercel env var (prod) | No |
| `NODE_ENV` | `.env` (sandbox), set by Vercel | No |

The `.env` file is gitignored (verify in Phase 6). No client
component imports any file that reads these variables. The bundler
rejects client imports of `db.ts`, `auth.ts`, `audit.ts`,
`authz.ts`, or `ai/*` by convention (no `db.ts` import in any file
with `"use client"`). Phase 6 adds an ESLint rule that enforces this
at lint time.

## 8. Input Validation

Every route handler validates input with Zod before doing anything
else. The schemas live in `src/lib/api-schemas/` (added in Phase 2).
Validation covers:

- MIME type and size for file uploads.
- Latitude/longitude range (-90 to 90, -180 to 180).
- `locationSource` enum.
- `eventId` format (cuid).
- `action` enum for review endpoints.
- `comment` length (max 2000 chars) for review actions.
- `severityOverride` range (0–100) for review actions.

A 400 response with the flattened Zod errors is returned on
failure. No business logic runs on unvalidated input.

## 9. Image Safety

Beyond MIME and size, images are sanitized:

- `sharp` re-encodes the uploaded image to normalized JPEG (quality
  85) before storage. This strips any embedded payloads (e.g., EXIF
  thumbnails, comments) and defeats decompression-ratio attacks.
- The original file is preserved only under
  `uploads/<eventId>/<reportId>.<ext>` and is never served to
  anyone other than the original contributor.
- A thumbnail (`<reportId>.thumb.<ext>`, max 400×400) is generated
  for list views.
- A stripped copy (`<reportId>.stripped.<ext>`, no EXIF) is
  generated for reviewer view.
- The `imagePath` field stores the path to the original. The route
  handler that serves an image to a reviewer serves the stripped
  copy; the route handler that serves an image to the contributor
  serves the original (the contributor already knows where they
  took it).

## 10. Threat Model (Brief)

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Attacker enumerates valid emails via login timing | Medium | Medium | Constant-time bcrypt fallback (§1.3) + audit log |
| Attacker brute-forces a known account | Medium | High | Custom per-account rate limit (`LOGIN_RATE_LIMIT_PER_HOUR`, default 10) enforced in middleware + bcrypt cost 10 + audit log |
| Attacker uploads a non-image file disguised as JPEG | High | Low | Server-side MIME sniff + `sharp` re-encode |
| Attacker uploads an image bomb (10 MB of zeros that decodes to 100 MB) | Medium | Medium | Size + dimension caps + `sharp` re-encode |
| Attacker uploads an image with embedded prompt-injection text | Low | Medium | Fixed system prompt + Zod strict schema + raw output not exposed |
| Reviewer escalates self to ADMIN via direct API call | Low | High | `requireRole` enforced server-side; client role is informational |
| Reviewer mass-confirms own reports | Medium | Medium | Reviewer cannot review own reports — added as an authz rule in Phase 4 |
| AI provider returns malformed JSON to break the schema | Medium | Low | Zod validation → `needs_manual_review` instead of crash |
| AI provider is down / times out | High | Medium | `retryable_error` + backoff + reviewer can manually mark `needs_manual_review` |
| Stolen JWT is replayed after sign-out | Low | Medium | Acceptable for MVP; production adds session revocation (ADR-002) |
| Audit log is tampered with | Low | High | Append-only; no UPDATE/DELETE route; admin-only read |
| DB file is read directly from disk | Low | Critical | Sandbox file perms; production moves to managed Postgres with VPC-only access |

### 10.1 Reviewer-Cannot-Review-Own-Reports Rule

A reviewer must not confirm their own submission — this prevents a
single user from creating and confirming a fake incident. The
`/api/reports/[id]/review` route handler (Phase 4) will check
`report.reporterId !== user.id` and return 403 if they match,
recording a `PERMISSION_DENIED` audit entry. The Review Queue
query (`/api/reports?status=needs_review`) excludes reports where
`reporterId === session.user.id` when the session role is
`REVIEWER` (but not `ADMIN`, who can review anything in the MVP).

## 11. Verification

Each boundary above has a corresponding test plan:

| Boundary | Test type | Phase |
|---|---|---|
| Constant-time login | Unit (regression in `auth.test.ts`) | 1 ✅ |
| Role-gated nav | Unit (`nav.test.ts`) | 1 ✅ |
| Authz rules (canAccessReport, canMutateReport, reportReadWhere) | Unit (`authz-rules.test.ts`) | 1 ✅ |
| `requireRole` denial is audited | Integration | 4 |
| Public map excludes non-reviewed reports | Integration | 5 |
| `Analysis.rawOutput` not in any client response | Integration | 3 |
| Image size + MIME caps enforced | Integration | 2 |
| Per-event AI budget enforced | Integration | 3 |
| Reviewer cannot review own report | Integration | 4 |
| Upload rate limit enforced | Integration | 2 |
| Audit log is append-only (no UPDATE route) | Grep test | 6 |

The grep test in Phase 6 asserts that no production route handler
exports a function whose name starts with `updateAuditLog` or
`deleteAuditLog`, and that the `AuditLog` Prisma delegate is never
called with `update` or `delete` outside of test code.
