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

After this workflow is merged to `main`, visit **Actions → Supabase staging migration preview → Run workflow** on `main`. Select **Run workflow** to create a **new run**; **Re-run jobs** on an older failed run reuses the old commit/workflow. If the project ref variable/secret is still unavailable, fill the optional **project_ref** input with *only* the staging Supabase project reference (for example, the ID in the project's dashboard URL), not a URL. The input has precedence over GitHub Variables and Secrets and is validated before connecting. It is not a password and must never be used to point at the production database.

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


## Fresh runs versus old reruns

GitHub **Re-run jobs** always replays the same commit and workflow definition as the original run. A failed preview originally created on commit `6eb990e` cannot acquire the newly added `project_ref` input, even if you edit the variable later.

This workflow now supports two ways to create a **fresh** run: (1) use **Run workflow** with branch `main` (and optionally enter `project_ref`), or (2) after the workflow file is changed on `main`, GitHub automatically starts a new read-only preview. The automatic trigger only watches edits to `.github/workflows/supabase-staging-preview.yml`; it does not run on every source commit.

The automatic trigger has **no manual input**. It requires `STAGING_SUPABASE_PROJECT_REF` to exist as a repository or staging environment Action Variable/Secret. If missing, the job fails at preflight without connecting to any database. The environment-level review protections, if configured, still apply. Both trigger types are read-only and scoped to the linked staging project.

## CLI version and migration filename safety

The preview pins **Supabase CLI 2.72.7** so a new CLI release cannot silently change the meaning of a remote-target flag. The workflow uses explicit `--linked` flags after linking the designated staging project and only runs `db push --dry-run`. It cannot modify the remote database.

The repository's historical migrations use four-digit names such as `0001_schema.sql`. The documented Supabase naming convention is `YYYYMMDDHHmmss_description.sql`; a short version may fail timestamp parsing or confuse migration history. The workflow warns about every nonstandard file.

**Do not rename existing applied migrations without inspecting the real remote `supabase_migrations.schema_migrations` history**. Changing a previously applied migration version causes local/remote divergence and can lead to accidental replays. On a verified empty staging project, a coordinated one-time renaming can be reviewed separately. Never guess an applied version or use `supabase migration repair` as a workaround without evidence.

