# Staging setup, security verification and temporary QA users

The TerraResponse AI live Vercel site currently connects to Supabase project `ywopsafppyykhwrejliz`. **Never use this live project as staging.**

## Project cost and creation

On 2026-10-31 the connected Supabase Free organization reported **$0 per month** for a new project and **$0.01344 per hour** for a development branch. The safer choice for isolated role testing is a separate project if the organization remains eligible for another free project. Prices, quotas, limits and organization choices must be confirmed by the owner before provisioning.

The new project should be named `TerraResponseAI-Staging` in the intended organization, in the same region as production where available. A new project is a separate project with no production accounts, reports or evidence. Do not clone private production records.

## Provisioning order

1. Create/approve a separate staging project, set `PRODUCTION_SUPABASE_PROJECT_REF=ywopsafppyykhwrejliz` as a **GitHub Actions Variable**, `STAGING_SUPABASE_PROJECT_REF=<staging-ref>` as an Actions Variable, and configure protected GitHub environment `staging` with required reviewers if available.
2. Add **staging-only** secrets: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_DB_PASSWORD`, plus `SUPABASE_ACCESS_TOKEN` for CLI. Do not copy production keys into staging environment. The workflow rejects known production ref and mismatched credentials.
3. For the account workflow, separately configure six test secrets in the protected staging environment: `TEST_REPORTER_EMAIL`, `TEST_REPORTER_PASSWORD`, `TEST_REVIEWER_EMAIL`, `TEST_REVIEWER_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`. Test passwords should be randomly generated, unique, and at least 16 characters. Do not paste them in issues, pull requests, files, or chat.
4. In the GitHub Actions **Supabase staging migration preview**, verify that `0001`–`0012` are pending for an empty staging DB; review each migration, especially trigger/Storage/PostGIS/RPC changes.
5. Only with the owner’s approval, use **Apply Supabase staging migrations** on `main`. Enter the staging project ref and `APPLY-STAGING-ONLY`. This writes schema to staging.
6. Run the **Staging integration verification** workflow and inspect the Supabase Security Advisors. Confirm service_role access to audit_events and authenticated RLS behavior; confirm anon cannot execute any privileged RPCs.
7. Only once SQL and authorization tests pass, run **Provision three staging-only QA users**, enter exact staging ref and `CREATE-STAGING-TEST-USERS`. The protected job makes one reporter, reviewer, and admin with confirmed test email accounts via the Auth Admin API. This does not globally disable confirmation.
8. Use a **protected Vercel Preview deployment**, configured with staging Supabase credentials, for test logins. Do not replace the public production URL’s Supabase credentials with staging values.
9. After testing, disable or remove the provisioning workflow, delete staging test users and evidence, configure real SMTP and test regular confirmed-email sign-up. Resolve [issue #21](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21) before release; resolve [issue #23](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/23) after audited RLS/RPC checks.

## Hardening note

Migration `0011` previously granted table-wide UPDATE on reports. That superseded the restricted mutable-column privileges set by `0002` and `0006`. The latest change preserves column-level permissions; `0012` closes public execution of SECURITY DEFINER helper functions and prevents reading another user's event role. **These SQL changes are not yet remotely tested** and should be replayed on staging with real reporter/reviewer/admin JWTs before considering production.
