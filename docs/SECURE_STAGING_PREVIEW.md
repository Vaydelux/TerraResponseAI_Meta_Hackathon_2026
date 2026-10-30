# Secure Supabase staging preview — TerraResponse AI

The GitHub Actions workflow `.github/workflows/supabase-staging-preview.yml` checks remote migration history and previews pending migrations. **It does not write to the remote database.**

## 1. Use a separate staging Supabase project

Never point the preview at a production or hackathon demo database if you intend to test migrations destructively. Obtain the staging project reference in Supabase's dashboard.

## 2. Configure GitHub Actions credentials

Open **Settings → Secrets and variables → Actions** for this repository.

Create these **repository secrets** (encrypted; never commit to Git):

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Least-privilege Supabase personal access token permitted to link the staging project |
| `STAGING_SUPABASE_DB_PASSWORD` | Password for the separate staging database |

Create this **repository variable** (non-secret):

| Name | Value |
|---|---|
| `STAGING_SUPABASE_PROJECT_REF` | Supabase staging project reference ID |

**Common setup error:** If the staging workflow reports `Missing STAGING_SUPABASE_PROJECT_REF`, create that exact name in **Settings → Secrets and variables → Actions → Variables**, or use **Secrets** with the same name. This updated workflow reads the Variables value first, then the Secrets value if the variable is empty. The value is the staging project reference from your Supabase project URL, not a Supabase URL, token, or database password. The staging environment must have access to the selected setting. Never paste credential values into workflow logs or messages.

Create an environment named **staging** in **Settings → Environments**. Configure allowed branches and approval rules if your GitHub plan supports them. Environment secrets can be used instead of repository secrets when supported; the workflow reads either using the same `secrets.*` syntax. Note that GitHub Free private repositories may not support environment secrets.

If you later add real integration testing, use separately scoped secrets such as:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (these are public browser configuration values, though they can still be stored as Actions variables)
- `SUPABASE_SERVICE_ROLE_KEY` for trusted server-side verification only; never expose it to the browser or public workflow output
- `MODEL_API_KEY` and `SAM_API_KEY` for opt-in live model smoke tests

Do **not** create a plaintext `.env.local` file in the repo. Do not paste credentials in PR comments, workflow logs or chat.

## 3. Run the preview

After this workflow is merged to `main`, visit **Actions → Supabase staging migration preview → Run workflow** on `main`.

The workflow:
1. Verifies required variables exist, without logging their values.
2. Links to the staging project.
3. Runs `supabase migration list`.
4. Runs `supabase db push --dry-run`.

Neither `supabase migration list` nor `supabase db push --dry-run` applies migrations. If an error occurs, preserve the logs (after checking for sensitive data) and stop rather than forcing migration history repairs.

## 4. Approval before applying changes

Review the preview output and the actual migration SQL, including RLS policies, PostGIS functions, and storage policies. Once approved, a separate explicitly gated deployment workflow can be added.

Do not run remote `supabase db reset`, `supabase db push --include-seed`, or unreviewed `supabase migration repair`. Do not use real user data in disposable test environments.

## 5. Removing and rotating secrets

If no longer needed, delete a secret in the GitHub Actions settings and revoke the associated token/password on the provider side. Removing the GitHub secret does not revoke the token at Supabase or Meta. Rotate credentials if they were ever committed or disclosed; deleting a Git commit does not reliably undo exposure.

GitHub workflows can use secrets, but the connected assistant cannot retrieve their values. This is intentional.
