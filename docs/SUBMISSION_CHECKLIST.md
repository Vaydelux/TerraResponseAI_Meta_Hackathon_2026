# TerraResponse AI — Submission Checklist

> **Gate**: every item shows done/not done and supporting evidence; no
> unverified claims. Do not submit, publish, or share anything
> externally without explicit user approval.

## Submission metadata

**Title**: TerraResponse AI — Disaster-Photo Intelligence with Human Review

**Pitch**: Decision-support prototype that uses Meta Muse Spark 1.3 to produce structured observations from disaster photos, validated through a human review queue before appearing on an incident map — every observation labeled "AI-generated, not verified" until a reviewer acts.

**Product description** (~200 words):

TerraResponse AI is a decision-support platform for disaster response teams. Authenticated contributors upload disaster photos; the server validates the file (magic bytes + Sharp decode), extracts EXIF GPS, stores the original in a private Supabase bucket, and creates an EXIF-stripped derivative for AI inference. The server calls Meta Muse Spark 1.3 via the Chat Completions API with a JSON-schema-constrained response format, producing a structured observation: incident type, visible evidence, preliminary severity (1–5), uncertainties, and English + Tagalog summaries. A second Zod validation layer catches any schema drift. The observation is routed through a human review queue where a reviewer — who is NOT the contributor — confirms, corrects, flags, or rejects it. Every action is recorded in an append-only audit trail. Confirmed incidents appear on an incident map with a transparent 5-factor priority score (visual severity, facility impact, access disruption, time recency, corroboration). Optional SAM 3.1 segmentation overlays are available via the Responses API. The platform enforces fixed safety boundaries: no automatic dispatch, AI observations always labeled preliminary, priority scores for review prioritization only, bounded API spend, private storage with 60-second signed URLs, and a retention/deletion workflow.

**Architecture summary**: Next.js 16 (App Router, React 19, TypeScript strict) + Supabase (PostgreSQL + RLS + Auth + private Storage) + Meta Model API (Muse Spark 1.3 via Chat Completions, SAM 3.1 via Responses API). Single deployable — no separate backend service. Server-side identity verification via `supabase.auth.getUser()`. RLS on all 11 public tables. 60-second signed URLs for evidence access. 369 unit/integration tests + 86 E2E tests.

**Meta model integration summary**: Muse Spark 1.3 (`POST /v1/chat/completions`) with `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` for constrained structured output — a 5-factor disaster observation schema (incident_type enum, visible_evidence array, preliminary_severity 1-5, uncertainties, summary_en, summary_tl, needs_review=true). SAM 3.1 (`POST /v1/responses`) with `input` messages array (`input_text` + `input_image` content blocks) + `stream: true` for streaming mask data. Both use Bearer token auth at `https://api.meta.ai/v1`. Opt-in smoke tests call the real API (gated by `MODEL_API_KEY` / `SAM_API_KEY`).

**Known limitations**:
1. The full happy-path UI flow (login → upload → analyze → review → map with a real backend) is verified manually; the automated tests cover the logic (unit + integration) and the no-backend UI state (E2E).
2. The live Meta API smoke tests are opt-in (skip without keys).
3. Vercel Hobby plan's 10-second function timeout may be too short for the analyze route (30-second timeout + bounded retries); use Pro plan or lower `AI_CALL_TIMEOUT_MS`.
4. JWT session strategy without revocation (acceptable for an MVP).
5. The demo seed creates reports without real image bytes (storage keys point to non-existent objects).
6. No scheduled purge job (the purge is manual via the admin endpoint or a cron job the user sets up).

---

## Checklist

### 1. Working public repository

| Item | Status | Evidence |
|---|---|---|
| Git repo initialized on `main` branch | ✅ Done | `git log` shows 20+ commits from Phase 1 through Phase 16 |
| No tracked secrets (`.env`, API keys, credentials) | ✅ Done | `.env` removed from git tracking in the final commit; `git show HEAD:.env` returns "not in 'HEAD'" |
| No tracked DB files (`db/custom.db`) | ✅ Done | `db/custom.db` removed from git tracking; `.gitignore` has `/db/*.db` |
| No tracked test artifacts (`test-results/`) | ✅ Done | `test-results/.last-run.json` removed; `.gitignore` has `/test-results/` |
| `.env.example` committed (no real values) | ✅ Done | All secret values are empty quotes (`""`); the secrets-server-only.test.ts verifies this |
| `README.md` with problem, architecture, setup, Meta models | ✅ Done | Written in Phase 17; includes architecture diagram, sequence diagram, Meta model table, setup steps, env vars, safety limitations |
| `LICENSE` (MIT) committed | ✅ Done | `LICENSE` file committed with MIT License |
| No unauthorized image assets | ✅ Done | `git ls-files "*.jpg" "*.png"` returns no tracked images; the demo seed creates reports without real image bytes |

### 2. Deployed app

| Item | Status | Evidence |
|---|---|---|
| Vercel project created | ⏳ Not done | Requires manual setup — see `docs/DEPLOYMENT.md` §1.6 |
| Supabase project created | ⏳ Not done | Requires manual setup — see `docs/DEPLOYMENT.md` §1.1 |
| Database migrations applied | ⏳ Not done | Requires `supabase db push` — see `docs/DEPLOYMENT.md` §1.2 |
| Demo seed run | ⏳ Not done | Requires `bun run scripts/seed-demo.ts` — see `docs/DEPLOYMENT.md` §3.1 |
| `DEMO_MODE=1` set on Vercel | ⏳ Not done | Manual Vercel env-var configuration |
| Deployed URL loads | ⏳ Not done | Requires the above steps; verified locally with `DEMO_MODE=1` (the demo banner renders) |

### 3. Tested login and one fully working critical path

| Item | Status | Evidence |
|---|---|---|
| Login page renders (Setup state in sandbox) | ✅ Done | Playwright tests: `tests/e2e/happy-path.spec.ts` — "the login page renders with the brand" |
| Protected routes redirect to `/login` | ✅ Done | Playwright tests: 6 routes tested in `tests/e2e/failure-cases.spec.ts` |
| API endpoints return 503 NOT_CONFIGURED (no backend) | ✅ Done | Playwright tests: 6 endpoints tested in `tests/e2e/happy-path.spec.ts` |
| Analyze route state machine (mocked) | ✅ Done | 12 integration tests in `route.integration.test.ts` covering 503/401/404/409/200/429/402/422 |
| Upload route validates files + rate-limits | ✅ Done | 21 image-validate tests + 19 rate-limit tests |
| Review route enforces contributor-cannot-review | ✅ Done | 14 authz-rules tests + 20 escalation tests |
| Map excludes unknown-location reports | ✅ Done | 16 location tests + map-view filter logic |
| Priority score is deterministic + transparent | ✅ Done | 27 priority tests |
| Audit trail is append-only | ✅ Done | RLS policies block UPDATE/DELETE for non-admins; 7 audit tests |
| Live API smoke test (opt-in) | ✅ Done | `src/lib/ai/muse-spark.smoke.test.ts` + `sam.smoke.test.ts` — skip without keys |
| Full E2E (desktop + mobile) | ✅ Done | 86 Playwright tests (43 desktop + 43 mobile) |

### 4. Three-minute video accessibility

| Item | Status | Evidence |
|---|---|---|
| Demo script written with timestamps | ✅ Done | `docs/DEMO_SCRIPT.md` — 7 timestamped sections (0:00–3:00) |
| Demo script has actual clicks | ✅ Done | Each section lists exact clicks + what to say |
| Demo script has truthful claims | ✅ Done | "This is a prototype, not a deployed system" + "Precomputed mock outputs are clearly labeled" |
| Backup demo path documented | ✅ Done | `docs/DEMO_SCRIPT.md` "Backup demo" section — seeded data renders without a live API call |
| Video recorded | ⏳ Not done | Requires manual recording — follow `docs/DEMO_SCRIPT.md` |
| Video publicly accessible | ⏳ Not done | Upload to YouTube/Vimeo after recording |

### 5. Proper attribution / licensing

| Item | Status | Evidence |
|---|---|---|
| MIT License committed | ✅ Done | `LICENSE` file |
| No third-party code without attribution | ✅ Done | Dependencies are via `bun install` (npm packages with their own licenses); no vendored code |
| Meta API used per official docs | ✅ Done | Muse Spark via `/v1/chat/completions` (OpenAI-compatible); SAM 3.1 via `/v1/responses` (Responses API) — verified against official docs in Phase 15 |
| Supabase SSR pattern matches official docs | ✅ Done | `createServerClient` from `@supabase/ssr` with `cookies()` pattern — verified against official docs in Phase 15 |
| No unauthorized image assets | ✅ Done | No tracked images; demo seed creates reports without real photos |

### 6. All team contributors named

| Item | Status | Evidence |
|---|---|---|
| Contributors listed in README.md | ✅ Done | "TerraResponse Team" placeholder — update with actual names before public push |
| Contributors in `src/app/layout.tsx` metadata | ✅ Done | `authors: [{ name: "TerraResponse Team" }]` — update with actual names |
| Individual names | ⏳ Not done | User must provide actual contributor names |

### 7. Evidence of new work built during hackathon

| Item | Status | Evidence |
|---|---|---|
| Git history shows progressive development | ✅ Done | 20+ commits from Phase 1 (foundation) through Phase 16 (polish) |
| Worklog documents every phase | ✅ Done | `worklog.md` — 5000+ lines documenting 16 phases + reviews |
| 369 unit/integration tests | ✅ Done | 28 Vitest files + 2 skipped smoke tests |
| 86 E2E tests | ✅ Done | 3 Playwright spec files (desktop + mobile) |
| Supabase migrations (4 files) | ✅ Done | `0001_schema.sql` through `0004_resilience.sql` |
| RLS policies (11 tables) | ✅ Done | `0002_rls.sql` + `0004_resilience.sql` |
| Private storage policies (3 buckets) | ✅ Done | `0003_storage.sql` |
| Meta API integration (Muse Spark + SAM) | ✅ Done | `src/lib/ai/muse-spark.ts` + `src/lib/ai/sam.ts` |
| Cost controls + rate limits | ✅ Done | `src/lib/ai/cost-controls.ts` + `src/lib/rate-limit.ts` |
| Retention/deletion workflow | ✅ Done | `src/lib/storage/retention.ts` |
| Demo mode + seeded data | ✅ Done | `scripts/seed-demo.ts` + `src/components/terra/demo-banner.tsx` |
| Deployment guide | ✅ Done | `docs/DEPLOYMENT.md` (12 sections) |
| Demo script | ✅ Done | `docs/DEMO_SCRIPT.md` (3-minute script) |

---

## Commands to run before submission

```bash
# 1. Update contributor names in README.md + src/app/layout.tsx

# 2. Run all tests one final time:
bun run lint && bun run typecheck && bun run test && bun run build

# 3. Run the opt-in live API smoke tests (requires keys):
MODEL_API_KEY=<your-key> SAM_API_KEY=<your-key> bun run test:smoke

# 4. Deploy to Vercel (follow docs/DEPLOYMENT.md):
#    - Set env vars on Vercel
#    - Apply Supabase migrations
#    - Run the demo seed
#    - Set DEMO_MODE=1

# 5. Record the 3-minute demo video (follow docs/DEMO_SCRIPT.md)

# 6. Push to GitHub:
git remote add origin git@github.com:<your-org>/terraresponse-ai.git
git push -u origin main

# 7. Submit to the hackathon before November 4, 9:00 PM ET
#    (verify exact deadline at https://dev.meta.ai/events/global-hackathon)
```

## Deadline

**November 4, 2025 at 9:00 PM ET** — per the official event page at
https://dev.meta.ai/events/global-hackathon. Verify the exact
deadline in the official event dashboard before submitting.

> Do not submit, publish, or share anything externally without
> explicit user approval.
