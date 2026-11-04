# Hackathon live integration gates — TerraResponse AI

The current GitHub CI suite proves **lint, TypeScript typechecking, mocked unit/integration tests, and a Next.js production build**. It is NOT evidence of live Supabase RLS, real Meta inference, or successful database migration.

## Before any remote changes: staging project and historical versions

The production Supabase project ref is `ywopsafppyykhwrejliz`. Do not apply pending SQL to it without a separate production change approval. Create or select a **different Supabase project** in the owner-approved organization, verify its exact ref, configure `PRODUCTION_SUPABASE_PROJECT_REF` and `STAGING_SUPABASE_PROJECT_REF`, and keep separate credentials for each. Project creation may incur charges and requires the owner's organization and cost approval.

**Historical migration warning:** This repository contains legacy files `0001_schema.sql` through `0012_restrict_definer_rpc_access.sql`. The connected production database has already recorded versions `0001` and `0002`. New Supabase CLI migrations are timestamp-named; do not rename these applied files or repair remote history without independently reconciling actual SQL objects. Check `supabase migration list --linked` and `supabase db push --dry-run --linked` on isolated staging. If the CLI rejects these legacy version names, stop; do not force a migration to production. Create a reviewed, forward-only staging reconciliation plan instead.

**Current isolated staging mapping (2026-11-02):** All source migrations 0001–0012 were installed and verified on staging `ytfaetqvtbsbmcsdlkvk`. Supabase recorded timestamped versions rather than the repository's four-digit filenames. The protected staging preview/apply workflows now build an **ephemeral timestamp-aligned migration workspace** using `scripts/prepare-staging-migration-workspace.mjs`. They do not alter the source-controlled migrations or the remote migration ledger. Future staging migrations must use timestamped Supabase filenames with a version newer than `20261102064819`. Inspect the linked CLI migration list and dry run before any manual staging push. This mapping is **staging-only** and must not be applied to production `ywopsafppyykhwrejliz`.

The read-only REST verifier cannot necessarily read `supabase_migrations.schema_migrations` because it is not an exposed Data API schema. An API failure **does not** mean zero migrations are applied. The linked CLI migration list is the version-history authority; SQL catalog and role probes separately verify database effects. The permissions follow-up is the forward-only `20261104120000_restrict_internal_definer_rpc_execute.sql`; review and dry-run it on isolated staging only. Do not edit or replay the already-recorded `0012` history entry.

## 1. Run the staging migration preview first

Actions → **Supabase staging migration preview** → **Run workflow** on `main`. Start a new run; old reruns keep old workflow revisions.

If project reference variables still fail to resolve, supply `project_ref` (the lowercase staging project ID only) in the workflow form. Review `supabase migration list` and `supabase db push --dry-run`. No migrations are applied by this workflow.

**Do not apply migrations to the production/demo project** until the staging preview and SQL changes have been reviewed and the target explicitly approved. Keep `0008_fix_geospatial_observation_projection.sql` in the preview.

## 2. Configure the read-only staging verification

Open GitHub → Settings → Secrets and variables → Actions. Use a dedicated staging Supabase project. Configure:

- `NEXT_PUBLIC_SUPABASE_URL` — staging URL, usually `https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — staging anon/publishable key compatible with this repo
- `SUPABASE_SERVICE_ROLE_KEY` — staging service-role key; **server-only**
- `STAGING_SUPABASE_PROJECT_REF` — staging project ref (Actions Variable or Secret)
- `MODEL_API_KEY` — optional, for real Muse Spark smoke calls
- `SAM_API_KEY` — optional, for real SAM smoke calls

The manual workflow **Staging integration verification** checks that the configured URL's project reference matches the selected staging ref, then runs `bun run db:verify`. The verifier only reads/probes Supabase; its results distinguish live API evidence from static and unverified items. Failed or unverified RLS checks must not be called a successful security certification.

You can alternatively supply the reference in the workflow form. Never paste keys into any workflow input.

## 3. Explicit opt-in Meta smoke tests

`run_muse_spark` and `run_sam` are **false by default**. Enabling either results in real provider API calls and possible charges. The job only starts after the staging verifier job passes. If the selected API key is missing, fail rather than silently skip.

The smoke tests use repository demo imagery and validate that a real model returned a successful response. The smoke runs do **not** prove human review, storage authorization, or the browser flow.

## 4. Browser end-to-end acceptance (still required)

The repository now contains an opt-in authenticated Playwright acceptance
test at `tests/e2e/authenticated-flow.spec.ts`. You can execute it directly in
GitHub Actions via **Staging integration verification** → **Run workflow** with
`run_authenticated_e2e = true` (which builds the standalone production server
inside the protected `staging` environment and executes the full Reporter →
Meta Muse Spark → Reviewer → Map loop using the staging QA secrets), or run it
against a staging deployment with protected runner environment variables:

```bash
PLAYWRIGHT_BASE_URL=https://<staging-deployment> \
PRODUCTION_BASE_URL=https://<production-deployment> \
STAGING_SUPABASE_PROJECT_REF=<staging-ref> \
PRODUCTION_SUPABASE_PROJECT_REF=<production-ref> \
E2E_REPORTER_EMAIL=<protected-secret> \
E2E_REPORTER_PASSWORD=<protected-secret> \
E2E_REVIEWER_EMAIL=<protected-secret> \
E2E_REVIEWER_PASSWORD=<protected-secret> \
E2E_IMAGE_PATH=<runner-local-synthetic-image> \
bunx playwright test tests/e2e/authenticated-flow.spec.ts --project=chromium-desktop
```

Do not place the values above in Git, workflow output, traces, screenshots,
issues, or chat. The test asserts a 60-second signed URL, a non-`demo-mock-v1`
persisted observation, a different reviewer identity, an audited confirmation,
and the resulting map pin. A skipped test is not evidence of completion.

On a **dedicated staging deployment and test event only**:

1. Sign in as a staging contributor.
2. Upload a new JPEG/PNG/WebP image.
3. Confirm GPS, a valid manual location, or choose unknown explicitly.
4. Ensure the upload creates one private report and the UI initiates a separate authenticated AI analysis request.
5. Confirm the inference is successful or the user sees an honest failure state; no raw invalid model outputs should be shown.
6. Sign in as a different authorized reviewer; check the provisional observation, correct/confirm it, and verify the action audit.
7. Confirm a human-reviewed, located report appears in the correct event's incident map; unknown-location reports should not appear as fabricated coordinates.
8. Verify weather is labeled as context, with the provider and forecast validity, not evidence.
9. Verify report-level access denies another event's users and signed evidence URLs expire.
10. Test mobile, keyboard/focus, reduced-motion and failure paths.

Do not use real disaster evidence or private responder photos for a public demo without authorization. Keep synthetic/seeded examples clearly labeled.

## 5. Important limitations

- GitHub Actions Secrets are available to workflows but not readable through the GitHub assistant connection.
- The code assistant cannot launch a manual `workflow_dispatch` from the currently connected GitHub tools. A repo administrator must click **Run workflow**.
- Neither a dry-run nor the read-only verifier applies migrations.
- Frontend initiation of a long inference request is not yet a durable background job; browser navigation could interrupt it. Production reliability needs a persisted queue/worker or a safely reconciled retry strategy.
- No database transaction guarantee is claimed for the multi-step review API; verify failure/retry and partial-write behavior in staging before declaring it production ready.
