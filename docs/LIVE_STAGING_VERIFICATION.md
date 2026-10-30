# Hackathon live integration gates — TerraResponse AI

The current GitHub CI suite proves **lint, TypeScript typechecking, mocked unit/integration tests, and a Next.js production build**. It is NOT evidence of live Supabase RLS, real Meta inference, or successful database migration.

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
