# tests

Home for **cross-cutting test fixtures and integration test files**
that don't belong inside a specific `src/lib/` package.

## Layout

- `tests/fixtures/` — binary fixtures (sample images, mock AI
  responses). Populated in Phase 2 (`tests/fixtures/images/`) and
  Phase 3 (`tests/fixtures/ai-responses/`) per `docs/BUILD_PLAN.md`
  §5.
- `tests/migration.test.ts` — Phase 2 test that asserts the Phase 1
  → Phase 2 schema migration (status lowercase, `reviewOutcome`
  set, `locationSource` derived from `locationAccuracy`) produces
  the expected rows. Traces to `docs/ARCHITECTURE.md` §5.8 step 6.
- `tests/integration/` — route-handler integration tests added from
  Phase 4 onward (per `docs/BUILD_PLAN.md` §4 Phase 4 Tests).

## Unit tests

Unit tests for pure functions in `src/lib/` live next to the source
file as `*.test.ts` (e.g., `src/lib/authz-rules.test.ts`). This is
the Vitest convention and matches `vitest.config.ts`'s `include`
pattern (`src/**/*.test.{ts,tsx}`).

## Running tests

```bash
bun run test          # one-shot
bun run test:watch    # watch mode
bun run test:ui       # browser UI
```
