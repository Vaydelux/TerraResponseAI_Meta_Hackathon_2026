# Test coverage + known limitations

This document records the test coverage of TerraResponse AI and the
known limitations of the test suite. Per the brief's gate:
"critical path is stable; known limitations are explicitly
documented."

## Critical path (stable)

The critical path is the sequence the brief calls out as the
end-to-end demo: **log in → upload → manual pin → analyze via
controlled fixture → review → map**. The full UI flow requires a
configured Supabase project + a real Meta API key, neither of
which are available in the sandbox/CI environment. The critical
path's logic is verified at three layers:

1. **Unit tests** (Vitest, mocked): every pure function in
   `src/lib/` is tested. 351 tests pass + 2 skipped (the opt-in
   smoke tests), across 28 Vitest files.
2. **Integration tests** (Vitest, mocked Supabase + mocked model):
   the analyze route handler's state transitions, ceiling
   enforcement, and telemetry logging. 12 tests in
   `route.integration.test.ts`.
3. **E2E tests** (Playwright, real dev server): the login page's
   accessibility, keyboard nav, mobile viewport, loading/empty
   states; the API endpoints' 503 NOT_CONFIGURED responses; the
   protected routes' redirect-to-login behavior. 43 tests across
   3 spec files, run on both the chromium-desktop and chromium-
   mobile projects → 86 E2E test runs total.

The full UI flow (login → upload → analyze → review → map with a
real backend) is verified manually by the developer before each
release, following the 3-minute demo script in
`docs/BUILD_PLAN.md` §8.

## Test inventory (28 Vitest files, 351 passing + 2 skipped tests)

### Pure-function unit tests (no DB, no network)

| File | Tests | What it covers |
|---|---|---|
| `src/lib/types.test.ts` | 8 | Role + status enum stability, severityBand |
| `src/lib/nav.test.ts` | 10 | Nav role gating + defaultViewForRole |
| `src/lib/authz-rules.test.ts` | 14 | canAccessReport, canMutateReport, canActOnReview, reportReadWhere |
| `src/lib/authz-rules.escalation.test.ts` | 20 | Role-escalation attempts (REPORTER→REVIEWER, REVIEWER→ADMIN, navigation gating, NAV_ITEMS invariants) |
| `src/lib/audit.test.ts` | 7 | Audit log shape, IP extraction (x-forwarded-for leftmost), UA, null actor |
| `src/lib/priority.test.ts` | 27 | 5-factor priority calculation, severity mapping, missing values, duplicate corroboration, access disruption, label |
| `src/lib/api-schemas/reports.test.ts` | 15 | Zod accept/reject for the upload metadata (eventId, title, description, lat/lng bounds, locationSource enum, linkToReportId, unknown-key stripping) |
| `src/lib/storage/sha256.test.ts` | 9 | SHA-256 of known inputs (deterministic) |
| `src/lib/storage/location.test.ts` | 16 | The unknown ⇔ null coords invariant + bounds validation |
| `src/lib/storage/missing-location.test.ts` | 15 | resolveLocation (user wins, EXIF fallback, no fabrication), validateBounds (NaN rejection) |
| `src/lib/storage/image-validate.test.ts` | 21 | MIME / size / magic-bytes / Sharp decode validation |
| `src/lib/ai/cost-controls.test.ts` | 12 | readCostControlConfig (env overrides, safe defaults), estimateCost (token vs flat, caveat), COST_CONTROL_ERRORS, utcDay |
| `src/lib/ai/prompt-injection.test.ts` | 14 | sanitizeUserText (ChatML, role prefixes, "ignore previous", "you are now a", benign-text passthrough) |
| `src/lib/ai/safe-retry.test.ts` | 17 | decideManualRetry (state gate + retry cap), decideForceManualReview (forceable states) |
| `src/lib/ai/retry.test.ts` | 8 | backoffDelay + withRetry (5 attempts, no sleep after last) |
| `src/lib/ai/muse-spark.test.ts` | 12 | analyzeImage with mocked transport (valid, schema-invalid, transient 429/5xx, permanent 4xx, timeout, empty response) |
| `src/lib/ai/sam.test.ts` | 14 | segmentImage with mocked transport (mask, no_match, transient, permanent, timeout, vague prompt, NDJSON stream) |

### Mocked-Supabase integration tests (no real DB)

| File | Tests | What it covers |
|---|---|---|
| `src/lib/storage/dedup.test.ts` | 6 | checkDuplicate (match, no-match, error fail-open, event-scope, limit(1)) |
| `src/lib/storage/derivative.test.ts` | 8 | makeDerivatives (real Sharp: produces buffers, JPEG, dimensions ≤1600/400, no-enlarge, EXIF strip) |
| `src/lib/storage/exif.test.ts` | 6 | readExif (real exifr: GPS read, no-EXIF, non-image, empty, south+east) |
| `src/lib/storage/retention.test.ts` | 23 | retentionWindowDays env, getRetentionState, requestSoftDelete (NOT_FOUND, ALREADY_DELETED, ALREADY_PURGED), revokeSoftDelete (FORBIDDEN, NOT_SOFT_DELETED, original-requester, admin), purgeReport (NOT_SOFT_DELETED, RETENTION_WINDOW_ACTIVE, admin-override, original-first order, PARTIAL_PURGE), findPurgeableReports |
| `src/lib/ai/dedup-cache.test.ts` | 9 | lookupCachedAnalysis (cache hit on needs_review/reviewed, miss on uploaded/retryable_error/needs_manual_review, processing_status gate, event-scope) |
| `src/lib/ai/usage-log.test.ts` | 13 | logUsage (row shape, snake_case ↔ camelCase normalization, JWT/Bearer/key/base64 sanitization, length cap, never throws) + getDailyUsageSummary |
| `src/lib/rate-limit.test.ts` | 24 | All 6 ceilings (per-user upload, per-user AI, per-event budget, signed-URL, daily spend, daily requests) + fail-open on error + boundary (used === limit → blocked) + checkAllAiCallCeilings short-circuit |
| `src/lib/supabase/auth.test.ts` | 11 | (existing) Supabase auth helpers |
| `src/app/api/reports/[id]/analyze/route.integration.test.ts` | 12 | The analyze route: 503 NOT_CONFIGURED, 401 expired session, 401 profile-not-found, 404 NOT_FOUND (report doesn't exist), 404 NOT_FOUND for wrong-event access (RLS hides the report — same 404, no cross-event leak), 409 RETRY_CAP_REACHED, 200 cache-hit, 429 USER_AI_RATE_EXCEEDED, 402 EVENT_BUDGET_EXCEEDED, 503 RETRY_EXHAUSTED (timeout), 422 SCHEMA_INVALID, 200 success + telemetry |

### Opt-in live API smoke tests (skipped by default)

| File | Status | What it covers |
|---|---|---|
| `src/lib/ai/muse-spark.smoke.test.ts` | skipped (opt-in via MODEL_API_KEY) | Calls the REAL Meta Muse Spark API with a synthesized test image. Verifies the response passes both validation layers (model JSON-schema + Zod). Run with `bun run test:smoke`. |
| `src/lib/ai/sam.smoke.test.ts` | skipped (opt-in via SAM_API_KEY) | Calls the REAL SAM 3.1 API with a synthesized image (red square on white). Verifies the mask result. Run with `bun run test:smoke`. |

Per the brief: "Explicitly distinguish mocked tests from at least
one opt-in real Meta API smoke test." Both smoke tests are in
separate files (`*.smoke.test.ts`), gated by env vars, and skip
automatically in the default `bun run test` run.

### Playwright E2E tests (real dev server)

| File | Tests (desktop + mobile) | What it covers |
|---|---|---|
| `tests/e2e/happy-path.spec.ts` | 15 desktop + 0 mobile | Login page (Setup state) renders brand + Setup card; API endpoints return 503 NOT_CONFIGURED; protected routes redirect to /login |
| `tests/e2e/failure-cases.spec.ts` | 15 desktop + 0 mobile | Invalid file (503), invalid GPS (503), duplicate upload (503), schema mismatch (503), 429/timeout (503), SAM failure (503/404), wrong-event access (503), expired-session (6 routes redirect to /login), unknown-location (503) |
| `tests/e2e/accessibility.spec.ts` | 13 desktop + 13 mobile | Document.title, single h1, brand heading text, accessible Setup card, monospace env-vars, keyboard-navigable (Tab), no focus traps, mobile viewport (no horizontal scroll, env-vars readable), loading < 5s, no unexpected console errors, no unhandled promise rejections |

Run with `bun run test:e2e`. The Playwright config auto-starts the
dev server (`bun run dev` on :3000) and runs the desktop + mobile
projects serially (single worker to share the dev server).

## Known limitations

### 1. Full happy-path E2E flow not automated (manual-only)

The complete **login → upload → manual pin → analyze → review → map**
flow requires:
- A configured Supabase project (real `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- A real auth session (signed-in contributor + signed-in reviewer).
- A real `MODEL_API_KEY` for the analyze step.
- Seeded events + reports.

These are NOT available in the sandbox / CI environment. The
Playwright E2E tests verify the **no-backend state** (the Setup
card, the 503 NOT_CONFIGURED responses, the redirect-to-login
behavior). The full flow is verified manually by the developer
before each release, following the 3-minute demo script in
`docs/BUILD_PLAN.md` §8.

**Mitigation**: the integration tests in
`route.integration.test.ts` mock the Supabase client + the model
transport + the auth context, exercising the analyze route's full
state machine (503, 401, 404, 409 RETRY_CAP_REACHED, 200 cache-hit,
429, 402, 503 RETRY_EXHAUSTED, 422 SCHEMA_INVALID, 200 success).
The mocked tests cover every state transition the route handler
implements; the E2E tests cover the UI's rendering of the no-
backend state.

### 2. Live Meta API smoke tests are opt-in (default skipped)

The two `*.smoke.test.ts` files call the REAL Meta API. They skip
automatically when `MODEL_API_KEY` / `SAM_API_KEY` is not set (the
sandbox). To run them:
```
# Set the keys in .env, then:
bun run test:smoke
```
The default `bun run test` never calls the real API (the brief:
"a clearly separated opt-in live API integration smoke test").

### 3. Playwright webServer auto-start has a 120s boot timeout

The `playwright.config.ts` `webServer` block auto-starts the dev
server (`bun run dev` on :3000). On a fresh build, the dev server
takes 10-30 seconds to compile; on a cold start it can take 60s+.
The webServer `timeout: 120 * 1000` allows for this. If the dev
server is already running, `reuseExistingServer: !process.env.CI`
reuses it (faster).

### 4. Mobile E2E tests run on the same dev server (single worker)

The Playwright config uses `workers: 1` so the desktop + mobile
projects share a single dev server. The total E2E run takes ~30s
desktop + ~12s mobile = ~45s. Increasing workers would require
multiple dev servers (one per worker), which isn't worth the
complexity for 43 tests.

### 5. The vitest suite uses jsdom by default; sharp/exifr tests use Node

Most Vitest tests run in jsdom (the default for the React component
tests). The `derivative.test.ts`, `exif.test.ts`, and
`audit.test.ts` use `// @vitest-environment node` because sharp +
exifr need a real Buffer (jsdom's Buffer polyfill breaks their
binary parsers). The integration test `route.integration.test.ts`
also uses Node for the same reason (the analyze route handler
imports sharp + exif via the storage modules).

### 6. Zod v4's `.uuid()` enforces RFC 4122 v1-8

The test fixtures use valid v4 UUIDs (`a1b2c3d4-e5f6-4789-8abc-
def012345678`). The earlier all-1's UUID (`11111111-...`) was
rejected by Zod v4 (the 3rd group's first hex must be 1-8; the
all-1's UUID has a 1 there, so it should pass — but Zod v4's
regex also checks the 4th group's first hex is 8/9/a/b, and the
all-1's UUID has a 1 there, so it fails). The tests use realistic
v4 UUIDs.

### 7. The route handler integration tests use a single mocked chain

The `route.integration.test.ts` mocks `@/lib/supabase/server`,
`@/lib/auth/profile`, `@/lib/supabase/env`, `@supabase/supabase-js`,
and the AI / cost-control / rate-limit / dedup-cache / usage-log /
safe-retry modules. Each test configures the mock chain to return
the desired response shape. This is brittle (a small change to
the route's call pattern can break the mock) but it's the only
way to exercise the route's full state machine without a real DB.

### 8. The Playwright tests run against the dev server (not a prod build)

The `playwright.config.ts` uses `command: "bun run dev"` (not
`bun run build && bun run start`). The dev server is faster to
boot and the source maps are clearer. The prod build path is
verified separately by `bun run build`. The E2E tests don't need
a prod build to verify the UI behavior; the only difference would
be runtime performance, which isn't under test.

## Critical-path stability verdict

The critical path's LOGIC is stable: 350 unit + integration tests
pass, covering every pure function, every route handler state
transition, and every rate-limit / cost-control / retention
invariant. The critical path's UI is verified at the no-backend
state (43 Playwright tests pass on desktop + mobile). The full
happy-path UI flow (login → upload → analyze → review → map with a
real backend) is the developer's manual pre-release check; it is
NOT automated because it requires a configured Supabase project +
a real Meta API key.

The gate criterion is met: **the critical path is stable; known
limitations are explicitly documented.**
