# Three QA accounts — TerraResponse AI staging

The protected GitHub workflow **Provision three staging-only QA users** creates three distinct Supabase Auth identities, updates their **database** profile roles, and adds each to the same synthetic event. It deliberately refuses the production Supabase project, does not print passwords or user IDs, and does not require disabling production email confirmation.

## Planned accounts (staging only; not created until workflow succeeds)

| Sign-in email | Global role | Shared event role | Test |
| --- | --- | --- | --- |
| `qa.reporter@example.com` | `reporter` | `contributor` | Upload a synthetic incident, view own reports; no review or administration |
| `qa.reviewer@example.com` | `reviewer` | `reviewer` | Review a different reporter's submission, confirm/correct/flag; no admin privileges |
| `qa.admin@example.com` | `admin` | `coordinator` | View the shared event and exercise authorized administration, event coordination and review |

The workflow also creates **QA Demo — Three Roles** (`hackathon-qa-roles`) in isolated staging project `ytfaetqvtbsbmcsdlkvk`. These are synthetic testing identities only; do not upload genuine disaster evidence.

## Required one-time configuration

1. Open GitHub → repo → **Settings → Environments → staging**. Apply required owner approvals/branch restrictions where available.
2. In the protected **staging** environment, add `STAGING_SUPABASE_SERVICE_ROLE_KEY` as a **secret** from Supabase staging → Settings → API Keys. Never place it in code, workflow inputs, screenshots or chat.
3. In the same staging environment add three **distinct** 16+ character password secrets: `TEST_REPORTER_PASSWORD`, `TEST_REVIEWER_PASSWORD`, `TEST_ADMIN_PASSWORD`. Use randomly generated passwords and store them in a password manager. Never print them in workflow logs.
4. Set `STAGING_SUPABASE_PROJECT_REF=ytfaetqvtbsbmcsdlkvk` as a staging environment **variable** (or the existing staging secret of that name). The workflow defaults the nonsecret staging URL and known production ref to hardcoded allowlist values; if supplied as variables, they must match the allowlist. Optional email overrides are secrets `TEST_REPORTER_EMAIL`, `TEST_REVIEWER_EMAIL`, and `TEST_ADMIN_EMAIL`, each unique and valid. The default sample addresses above need no inbox on isolated staging because the Auth Admin API creates confirmed **staging-only** identities.
5. Launch GitHub → **Actions → Provision three staging-only QA users → Run workflow**, select `main`, enter project reference `ytfaetqvtbsbmcsdlkvk` and confirmation `CREATE-STAGING-TEST-USERS`. Review/provide any required environment approval.
6. Check that the action reports success and the final log says the QA event and contributor/reviewer/coordinator memberships are verified. A second run will intentionally fail rather than overwriting an existing QA event.

## How to sign in

**Important:** The main URL `https://terra-response-ai.vercel.app` is connected to **production Supabase** and will NOT recognize these staging accounts. Use a Vercel **Preview deployment** with staging Supabase URL/anon key. For normal login the deployed app also requires its own server-only `SUPABASE_SERVICE_ROLE_KEY` on **Preview**, pointing to **staging**, because the sign-in rate limiter audits pre-authentication failures through a privileged server client. This key must be configured directly in Vercel's encrypted Preview settings; never copy the production key into Preview.

Each person logs in with their email above (or configured override) and the corresponding password from your password manager. Log out between accounts, or use distinct private/incognito browser profiles.

## Test workflow

1. Reporter signs in and uploads one rights-cleared synthetic PNG/JPEG. Select an authorized manual location or `unknown`; verify it's visible to the reporter and the shared event is selected.
2. Reviewer signs in separately, opens the same event's queue, reviews the reporter's report, and checks status, correction/audit history and map. Reviewer self-review must be denied.
3. Admin signs in and verifies role-appropriate event coordination, settings and cross-role workflows. Reporter and Reviewer must not gain admin privileges through the UI or by changing profile fields.
4. Recheck Supabase RLS with three real JWT sessions, not just service-role SQL. Keep inference explicitly labeled simulated unless a real paid Meta API call was made.

### Security and cleanup

- Do not reuse these identities in production or grant these sample accounts special production access.
- Test passwords must remain secrets; rotate or delete after hackathon evaluation.
- To remove the staging test dataset, delete the `hackathon-qa-roles` event and its test-only reports **first**, then delete the three QA Auth users through the Supabase staging Auth dashboard. The event contains a `created_by` FK, so deleting the admin user first can fail.
- Do not disable email confirmation globally; this is an isolated test-account exception controlled by the **staging-only** Auth Admin API.
- Do not rerun the workflow blindly if an account/event already exists; inspect and clean up explicitly.

## Not a completed provisioning claim

The workflow only creates accounts **after** the owner supplies the staging service-role secret and separate password secrets and manually dispatches the protected GitHub Action. GitHub CI success verifies source logic, not that identities already exist or can log in. Verify the real Auth users and shared-event memberships in staging before announcing them ready.
