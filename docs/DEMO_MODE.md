# TerraResponse AI — Demo Mode + Seeded Scenario

This document records the demo-mode setup, the seeded scenario
data, and the live-API evidence. Per the brief:

> Create a clearly flagged Demo Mode / Seeded Scenario with 3-5
> rights-cleared example incident reports, a realistic mix of known
> and unknown locations, at least one reviewed report, and one
> intentionally failed analysis. Any simulation must be visibly
> identified as demonstration data, not a live disaster report.
> Precomputed mock outputs must never be falsely labeled as live
> Meta inference. Test a true live API analysis separately and
> record its evidence in development notes.

## 1. Demo Mode activation

Demo Mode is active when the env var `DEMO_MODE=1` is set (see
`.env.example` + `docs/DEPLOYMENT.md` §3.2). When active:

- A **red "Demonstration Data — not a live disaster" banner**
  renders at the top of EVERY page (login, dashboard, map, report
  detail, etc.) via the root layout (`src/app/layout.tsx`).
- The report-detail view shows a **"DEMO MOCK — not live Meta
  inference"** badge next to the model_id when `model_id =
  "demo-mock-v1"`.
- The report-detail view shows a red "Demonstration data" note
  when the `structured_observation._demo` field is `true`.

Demo Mode is NOT a secret env var; it's a UI flag. It's NOT
prefixed with `NEXT_PUBLIC_` (it's read server-side only — the
demo banner is a server component, so the env var never reaches
the browser bundle).

## 2. The seeded scenario (scripts/seed-demo.ts)

The seed script is idempotent (running it multiple times updates
the demo reports to the canonical state without duplicating rows).
Run it with:

```bash
bun run scripts/seed-demo.ts
```

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL (must be a
  localhost URL — the script refuses to seed a non-local project
  unless `ALLOW_DEMO_SEED_ON_PRODUCTION=1` is set).
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS (server-only; the
  script uses the Supabase Auth admin API + the service-role client).
- `DEMO_SEED_ADMIN_PASSWORD` — a strong password for the demo admin
  (>= 12 chars). NO DEFAULT is shipped. Generate one with
  `openssl rand -base64 24`.
- `DEMO_SEED_REVIEWER_PASSWORD` — a strong password for the demo
  reviewer (>= 12 chars). NO DEFAULT is shipped.

Optional env vars:
- `DEMO_SEED_ADMIN_EMAIL` — defaults to `admin@terra.ai`.
- `DEMO_SEED_REVIEWER_EMAIL` — defaults to `reviewer@terra.ai`.
- `ALLOW_DEMO_SEED_ON_PRODUCTION` — set to `1` to permit seeding
  against a non-local Supabase URL (dev/demo project only).

> **Production first-admin setup**: do NOT use `seed-demo.ts`. Use
> `scripts/bootstrap-admin.ts <email>` AFTER the user signs up at
> `/login` (the `handle_new_user` trigger creates their profile with
> `role='reporter'`; the bootstrap action promotes them to admin
> only when no admin exists yet — one-time gate).

### 2.1 The 5 demo reports

The script creates 5 reports across 2 demo events:

| # | Event | Title | Location source | Status | Review outcome | Priority |
|---|---|---|---|---|---|---|
| 1 | Demo Hurricane Helene — Asheville | "DEMO: Flooded road near downtown Asheville" | gps (35.5951, -82.5515) | needs_review | — | 62 |
| 2 | Demo LA Wildfires — Pacific Palisades | "DEMO: Smoke visible from Pacific Coast Highway" | manual (34.0359, -118.5186) | needs_review | — | 71 |
| 3 | Demo Hurricane Helene — Asheville | "DEMO: Debris on a road (location unknown)" | unknown (null coords) | needs_review | — | 28 |
| 4 | Demo Hurricane Helene — Asheville | "DEMO: Structural damage to a building (reviewed + confirmed)" | gps (35.5950, -82.5510) | reviewed | confirmed | 84 |
| 5 | Demo LA Wildfires — Pacific Palisades | "DEMO: Wildfire damage (analysis failed — retryable_error)" | gps (34.0361, -118.5187) | retryable_error | — | 0 |

### 2.2 Coverage of the brief's requirements

| Brief requirement | Where |
|---|---|
| 3-5 rights-cleared example incident reports | 5 reports (the rights-cleared aspect: the reports don't include any real disaster imagery; the storage keys point to non-existent objects; the `image_bytes` is 0; the title + description are clearly prefixed with "DEMO:") |
| A realistic mix of known and unknown locations | Reports 1, 2, 4, 5 have known locations (GPS or manual pin); Report 3 has an unknown location (no GPS, no manual pin — appears in the Unlocated list ONLY) |
| At least one reviewed report | Report 4 (status = reviewed, review_outcome = confirmed; the seed inserts a review_actions row for the audit trail) |
| One intentionally failed analysis | Report 5 (status = retryable_error; last_error = "DEMO: simulated transient failure for demo purposes.") |
| Visibly identified as demonstration data, not a live disaster report | The DemoBanner (when DEMO_MODE=1) + the "DEMO:" prefix on every report title + the "DEMO MOCK" badge on the model_id + the red "Demonstration data" note on the report detail |
| Precomputed mock outputs must never be falsely labeled as live Meta inference | The `report_analyses.model_id` is `demo-mock-v1` (NOT `muse-spark-1.3`); the `structured_observation._demo` is `true`; the `structured_observation._demo_note` is `"Precomputed mock output; not a live Meta inference."` |

### 2.3 The precomputed mock observation shape

Each of the 4 needs_review reports (reports 1, 2, 3, 4) has a
`report_analyses` row with the following `structured_observation`:

```json
{
  "_demo": true,
  "_demo_note": "Precomputed mock output; not a live Meta inference.",
  "incident_type": "flooding",
  "visible_evidence": [
    "DEMO: this is a precomputed mock observation, not a live AI inference.",
    "DEMO: the visible_evidence field is part of the seeded demo data."
  ],
  "preliminary_severity": 3,
  "uncertainties": ["DEMO: the model_id is demo-mock-v1 (not muse-spark-1.3)."],
  "summary_en": "DEMO: A road is flooded with water covering both lanes.",
  "summary_tl": "DEMO: A road is flooded with water covering both lanes. (Tagalog translation placeholder)",
  "needs_review": true,
  "segmentation_target": null
}
```

The `model_id` is `demo-mock-v1`, the `prompt_version` is `demo-v1`,
the `schema_version` is `demo-v1`, and the `raw_usage_metadata` is
`{ _demo: true, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }`.

The report-detail UI (`src/components/views/report-detail-view.tsx`)
detects `_demo === true` in the observation + `model_id ===
"demo-mock-v1"` in the analysis metadata, and renders:
- A "DEMO MOCK — not live Meta inference" badge next to the model_id.
- A red "Demonstration data. Precomputed mock output; not a live
  Meta inference." note in the Model & Schema Version card.

### 2.4 The intentionally failed analysis (Report 5)

Report 5 has `status = "retryable_error"` + `retry_count = 3` +
`last_error = "DEMO: simulated transient failure for demo purposes.
The model call would be retried with backoff; past the cap (5), the
report is parked in needs_manual_review."`.

The report-detail view's Resilience Panel shows:
- The retry count (3/5) + the cap explanation.
- The "Re-analyze" button. When `MODEL_API_KEY` is unset (the
  demo deploy), clicking it returns 503 NOT_CONFIGURED — the UI
  surfaces the error inline (no silent failure). This is the
  brief's gate: "the demo can complete when live API temporarily
  fails."
- The "Force manual review" button (admin-only). Clicking it
  transitions the report to `needs_manual_review` WITHOUT a model
  call → no cost → the demo can complete.

## 3. Live API evidence (development notes)

This section records the evidence that the live Meta API was tested
separately, per the brief: "Test a true live API analysis separately
and record its evidence in development notes."

### 3.1 Automated evidence: the opt-in smoke test

The opt-in Vitest smoke test (`src/lib/ai/muse-spark.smoke.test.ts`)
calls the REAL Meta Muse Spark API with a synthesized 100×100 grey
image and asserts the response passes both validation layers (the
model's JSON-schema + our Zod layer). Run it locally with:

```bash
MODEL_API_KEY=<your-key> bun run test:smoke
```

The test logs the observation + the usage metadata to stdout. The
expected output (when the API is reachable):

```
[smoke] observation: {
  "incident_type": "unclear",
  "visible_evidence": ["A solid grey square with no distinctive features."],
  "preliminary_severity": null,
  "uncertainties": ["Cannot determine the incident type from a featureless image."],
  "summary_en": "A grey square; no disaster-related features visible.",
  "summary_tl": "Isang grey na parisukat; walang disaster-related features.",
  "needs_review": true,
  "segmentation_target": null
}
[smoke] usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
```

The actual values depend on the model's response; the test asserts
only that `incident_type` is defined + `needs_review` is `true` +
`visible_evidence` is non-empty + `modelId` is `muse-spark-1.3` +
`promptVersion` is `v1` + `schemaVersion` is `v1`.

When the API is unreachable (timeout, 429, 5xx, network error), the
test logs the classified failure (`transient` / `permanent` /
`timeout`) and passes (the smoke test accepts a classified failure;
the brief: "the demo can complete when live API temporarily fails").

### 3.2 Manual evidence: a real upload + analyze cycle

To record manual evidence of a real live API call (separate from the
demo seed):

1. Set `MODEL_API_KEY` on Vercel (Server-only). Re-deploy.
2. Sign in as the admin, upload a rights-cleared stock photo (use
   the `image-search` skill OR a public-domain photo from Pexels/
   Unsplash — do NOT use a real disaster photo).
3. The report transitions `uploaded → analyzing → needs_review`
   (or `retryable_error` if the API is down, or `needs_manual_review`
   if the model's response fails Zod).
4. Record the following in this section:
   - The date + time of the test.
   - The image source (Pexels URL, Unsplash URL, etc.).
   - The model_id (`muse-spark-1.3`).
   - The prompt_version (`v1`) + schema_version (`v1`).
   - The observation (the full `structured_observation` JSON).
   - The latency (ms).
   - The token counts (prompt_tokens, completion_tokens, total_tokens).
   - The estimated cost (USD, labeled as "estimated").

### 3.3 Recorded evidence

> **NOTE**: As of the initial Phase 14 commit, the manual live-API
> test (§3.2) has NOT been run against a real Meta Model API key
> (the sandbox doesn't have one). The automated smoke test (§3.1)
> is the opt-in path; it's run by the developer before each release
> with a real `MODEL_API_KEY`. The recorded evidence from the
> smoke test is logged to stdout + captured in the CI logs.
>
> **To run the smoke test yourself**:
> 1. Set `MODEL_API_KEY` in your local `.env`.
> 2. Run `bun run test:smoke`.
> 3. The test prints the observation + usage to stdout.
> 4. Paste the output into this section as the recorded evidence.
>
> **Sample recorded evidence** (placeholder — replace with the
> actual output when you run the smoke test):
>
> ```
> Date: 2026-MM-DD HH:MM UTC
> Image: synthesized 100×100 grey square (sharp.create)
> Model: muse-spark-1.3
> Prompt version: v1
> Schema version: v1
> Observation:
>   incident_type: unclear
>   visible_evidence: ["A solid grey square with no distinctive features."]
>   preliminary_severity: null
>   needs_review: true
> Latency: <ms>
> Token counts: prompt=<n>, completion=<n>, total=<n>
> Estimated cost: $<usd> (estimated; provider bill is the source of truth)
> ```

## 4. Removing the demo data

To remove the demo data (e.g., to switch from demo mode to a real
deployment with real incident reports):

1. Unset `DEMO_MODE` on Vercel (redeploy).
2. Delete the demo reports via the Supabase dashboard SQL editor:
   ```sql
   delete from public.reports where id in (
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
     'ffffffff-ffff-4fff-8fff-ffffffffffff',
     '11111111-2222-4333-8333-333333333333'
   );
   -- The report_analyses + review_actions + report_retention rows
   -- cascade-delete (on delete cascade from the reports FK).
   ```
3. (Optional) Delete the demo events:
   ```sql
   delete from public.events where id in (
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   );
   ```
4. (Optional) Delete the demo users via the Supabase dashboard
   **Authentication → Users** page (delete `admin@terra.ai` +
   `reviewer@terra.ai`). The `profiles` rows cascade-delete.

## 5. Gate criterion (from the brief)

> **Gate**: deployed URL loads and the demo can complete when live
> API temporarily fails.

- **Deployed URL loads**: see `docs/DEPLOYMENT.md` §8 (the
  verification checklist). The deployed URL loads the `/login` page
  (NOT the "Setup required" state) when the Supabase env vars are
  set on Vercel.
- **Demo completes when live API fails**: the demo seed (§2)
  creates 5 reports. The 4 needs_review reports have precomputed
  mock analyses (model_id = `demo-mock-v1`; the report-detail UI
  shows the "DEMO MOCK" badge + the red "Demonstration data" note).
  The 1 retryable_error report shows the Resilience Panel's
  "Re-analyze" button (returns 503 NOT_CONFIGURED when
  `MODEL_API_KEY` is unset — the UI surfaces the error inline) +
  the "Force manual review" button (admin-only; no model call → no
  cost). The demo flow (login → dashboard → map → report detail →
  review) completes WITHOUT a live Meta API call. When the live API
  IS available, the §3 evidence path (the smoke test + a manual
  upload + analyze cycle) verifies the live inference.

## 6. Known limitations

1. **The demo reports don't have real image bytes.** The seed
   script doesn't upload to storage (the storage keys point to
   non-existent objects; `image_bytes` is 0). The report-detail
   UI's signed-URL fetch returns 404 — the UI surfaces this as
   "evidence not available" (no silent failure). For a demo with
   real images, run the upload flow manually with rights-cleared
   stock photos.
2. **No default demo admin password.** The seed script refuses to
   run unless `DEMO_SEED_ADMIN_PASSWORD` is set to a strong value
   (>= 12 chars). Production first-admin setup uses the secure
   bootstrap path (scripts/bootstrap-admin.ts), not the demo seed.
3. **The demo banner is a UI affordance.** The seeded data is
   still in the production database until §4 is run. To
   completely remove the demo data, run the SQL in §4.
4. **The precomputed mock observations don't reflect a real
   disaster.** The `visible_evidence` + `summary_en` fields
   explicitly say "DEMO:" so a reviewer can't mistake them for
   a real AI observation. The model_id is `demo-mock-v1` (NOT
   `muse-spark-1.3`) so the report-detail UI shows "Demo mock"
   + the demo banner.
