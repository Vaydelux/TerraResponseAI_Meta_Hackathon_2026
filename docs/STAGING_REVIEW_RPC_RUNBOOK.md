> **Staging status, 2026-11-02:** Migration `0010` has now been successfully installed and recorded in isolated staging `ytfaetqvtbsbmcsdlkvk` through the Supabase migration interface after removing CASE expressions that confused its SQL parser. The `submit_review_atomic` function, request ID column/index, anon-deny and authenticated-execute grants have been verified in the live catalog. **Do not run the manual installer on this staging project again.** The workflow intentionally aborts when the function exists. Continue with role-based integration tests and reconciliation of the connector-generated timestamped migration ledger before using `supabase db push`. Production remains untouched.

# Staging-only review RPC installation — owner-run, guarded

The ordinary Supabase migration executor currently misparses the 0010 review function body. A protected GitHub Actions workflow runs the **unchanged, original** `supabase/migrations/0010_atomic_review_actions.sql` file through PostgreSQL `psql` in one transaction. This avoids relying on a statement splitter. It is **staging-only**, not a production release step.

## Before running

In GitHub → repository → **Settings → Environments → staging**, require owner approval for the environment when available. Configure these values **directly in the interface**, never in chat, source code or logs:

| Where | Name | Required value |
|---|---|---|
| Staging environment secret | `STAGING_DATABASE_URL` | Full staging PostgreSQL connection URL with URL-encoded password and `?sslmode=require`. Must target the known staging project `ytfaetqvtbsbmcsdlkvk`; direct `db.<ref>.supabase.co:5432` (when IPv6 available) or Supavisor session pooler `*.pooler.supabase.com:5432` with username `postgres.<ref>` |
| Staging environment variable | `STAGING_SUPABASE_PROJECT_REF` | `ytfaetqvtbsbmcsdlkvk` |
| Staging environment variable | `PRODUCTION_SUPABASE_PROJECT_REF` | `ywopsafppyykhwrejliz` |

Use the **staging database password** from the staging Supabase project, not the production database password. Do not use the transaction pooler on port 6543. The workflow refuses unknown project refs, missing SSL, unexpected database names/users, missing passwords, unsupported ports, and production.

## Execute

1. Ensure the workflow file has landed on reviewed `main` and its CI is green.
2. Navigate to GitHub → **Actions → Staging install review transaction (manual) → Run workflow**.
3. Select `main`; type staging project ref `ytfaetqvtbsbmcsdlkvk`.
4. For the confirmation input, enter `INSTALL-REVIEW-STAGING-ONLY`.
5. Approve the protected `staging` environment prompt, if enabled.
6. Inspect **each step** and require success. No SQL changes occur on any other Supabase project.

If the precheck detects a previously created review function, the workflow aborts rather than replacing it. The installation is `--single-transaction`: a SQL error rolls back the 0010 installation, so the database is not partially updated.

## Validation after successful installation

- Verify `public.submit_review_atomic(uuid, uuid, text, text, text, jsonb)` exists.
- Verify `review_actions.request_id` and its unique index exist.
- Verify `anon` cannot execute that function and `authenticated` can.
- Test a real authenticated reporter (must be denied), an authorized separate reviewer (must succeed), reviewer self-review (must be denied), an outsider (must be denied) and an admin (policy-dependent; only authorized privileges). Verify changes/rollbacks in both action history and analyses.
- Run Supabase security advisors and confirm there are no anonymous privileged functions.
- Audit the **connector-generated migration ledger** (0001–0009, 0011–0012); the `psql` step **does not** add a history row for 0010. A deliberate, separately reviewed reconciliation is required before any subsequent `supabase db push` or production migration.
- Test the browser flow: separate reporter and reviewer identities, rights-cleared synthetic photo, valid/unknown coordinates, AI result (Meta paid call only if opted in and credentials configured), reviewer transaction, reviewed-map display.
- Keep GitHub [#30](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/30) open until every staging test and migration-history check passes. Keep email verification issue [#21](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21) open independently.

## Out of scope

This workflow does **not** create demo users, seed reports, disable email verification, run paid AI inference, repair migration versions, write to production or claim emergency-response readiness. Staging runtime keys are not installed by this workflow.
