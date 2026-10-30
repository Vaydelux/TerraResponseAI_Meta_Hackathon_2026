# TerraResponse AI — Vercel Preview and Supabase staging launch gates

**Scope:** disposable hackathon rehearsal. A **successful GitHub CI build is not proof of remote database readiness or working OAuth, storage, RLS, or Meta model inference**.

## Recommended order

1. **Back up and identify staging.** Open Supabase, verify the staging project reference, region, and project URL. Confirm staging is a **separate, disposable project**, not the intended production/demo database. The previous GitHub Actions run only did `db push --dry-run`. It did **not** apply pending SQL `0003`–`0010`. Protect your staging database (backup/export if it contains any irreplaceable data).
2. **Review migration SQL.** Confirm storage policy effects, PostGIS extension availability, `auth.users` trigger modifications in 0007, WebP constraint 0009, and the `submit_review_atomic` definer RPC in 0010. Have a database owner check actual migration history and that the target staging project is correct.
3. **Run the manual staging apply workflow**, only if you authorize those writes. In GitHub Actions → **Apply Supabase staging migrations** → **Run workflow** on `main`, enter the **exact existing** `STAGING_SUPABASE_PROJECT_REF` and `APPLY-STAGING-ONLY`. The workflow requires the staging URL to match the configured reference. It checks history, dry-runs, then **runs `supabase db push --linked`, which writes SQL to staging**. Do not run against a production project. If the workflow fails, stop and inspect the log; do not blindly repair or reapply.
4. **Read-only staging verifier.** Run **Staging integration verification**, with the `project_ref` input if needed. Use its results to check schema, private buckets, and PostGIS/RPC presence. This verifier by itself does not fully prove event-scoped RLS or transactional review behavior.
5. **Create a protected Vercel Preview deployment** from a non-production branch. A Vercel project often treats the linked default branch as Production, so don't assume a `main` deployment is Preview. Use Vercel Preview, Deployment Protection, and synthetic test photos/accounts. Avoid exposing the demo before authorization and access checks pass.
6. **Set Vercel environment variables in the Preview scope** (Vercel does **not** automatically inherit GitHub Actions Secrets):

| Name | Example source | Security |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase Project URL | Client-visible |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging Supabase API key (legacy anon if this repo expects it) | Client-visible, RLS required |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service_role key | **Server only**, never NEXT_PUBLIC_ |
| `MODEL_API_KEY` | Meta Model API key (optional for initial UI test) | Server-only |
| `SAM_API_KEY` | Meta SAM API key (optional) | Server-only |
| `DEMO_MODE` | `1` for synthetic demonstration data labeling | Not a secret |

Do **not** copy `SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF`, or Vercel credentials into app runtime env unless the app truly requires them. They are for migration tooling, not web traffic.

7. **Set Supabase Auth URL configuration.** Add the exact HTTPS Vercel Preview deployment origin/approved redirect URLs for `/auth/callback` in Supabase Auth URL Configuration. The existing `supabase/config.toml` local `site_url` is not the live hosted Supabase project's auth setting. Confirm the configured redirect is on the correct deployment and same-origin.
8. **Run actual browser acceptance**: contributor login, one real JPG/PNG/WebP upload, explicit location confirmation/unknown state, private storage, AI request/fallback, authorized **different** reviewer decision, corrections/atomic action auditing, pending/confirmed Seals, event switching, Geo map and weather-context labels, signed evidence URL expiration, logout and refresh. Test mobile widths, keyboard/focus, error paths and reduced motion. Use only synthetic/right-cleared data.
9. **Run opt-in live provider smoke tests** only after keys and usage limits are configured. These can incur charges. The current upload-to-analysis request is browser-triggered, not a durable server queue; losing the browser connection can interrupt the workflow. A dedicated durable background job and recovery test are still production blockers.
10. **Only consider production after** role-isolation/security tests with multiple accounts, migration verification, deployment log checks, and authorization by the project owner.

## The manual migration workflow

Workflow: `.github/workflows/supabase-staging-apply.yml`. It intentionally does **not** have a push/PR trigger. It requires exactly typed confirmation, a configured staging project ref, an independently configured URL that matches that ref, and a `main` branch run. GitHub **staging** environment reviewer approvals are recommended if available in your GitHub plan.

**Limit:** GitHub stores the secret values encrypted; the GitHub integration can edit workflows and inspect logs, but cannot retrieve the secrets or launch `workflow_dispatch` with the currently available tool actions. The database must be reviewed and the workflow manually triggered by the authorized repository owner. A failure during SQL apply might be partially effective; inspect the migration logs/state and restore from an approved backup strategy rather than guessing.

## Important deployments limits

- The service-role key must remain in the Vercel server environment and never be sent to a Client Component.
- A Vercel Preview build and a passing CLI dry-run alone do not imply RLS, migration correctness or functional availability.
- GitHub secrets are not exposed as Vercel environment variables automatically.
- Avoid real private disaster reports or responder locations in public hackathon demos.
