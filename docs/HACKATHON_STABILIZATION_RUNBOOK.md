# TerraResponse AI — Hackathon stabilization & runnable demo

**Last reviewed:** November 3, 2026  
**Mode:** Code and test improvements only; Vercel deployment hold stays ON.

> The demo is disaster **decision support**, not emergency dispatch. AI observations are provisional and may be wrong; human review is separately recorded. Never present a synthetic test photo as a real disaster or an unverified severity estimate as an official warning.

## 1. Vercel release freeze

The existing `terra-response-ai` project is configured to ignore automatic Git builds with **Ignored Build Step: `exit 0`**, and **Preview Deployments disabled**. Leave the existing READY production deployment untouched during development. Do not use Project Pause (it would block users from the active production domain).

GitHub Pull Requests and GitHub Actions can still run. Do not use Vercel Deploy, Redeploy, Promote or Rollback until the staging acceptance test below passes and the owner approves a release.

To resume later in the Vercel Project Settings, clear **Ignored Build Step** and re-enable **Preview Deployments**. Check the actual settings and that a reviewed commit is selected before the next deployment.

## 2. Local setup (Windows PowerShell)

Prerequisites: Git, Node.js compatible with Next.js 16, and Bun. Use the **staging** Supabase project and its corresponding key pair, not production.

```powershell
git clone https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026.git
cd TerraResponseAI_Meta_Hackathon_2026
bun install --frozen-lockfile
Copy-Item .env.example .env.local
# Edit .env.local in your editor; never commit it or paste secrets in chat.
bun run lint
bun run typecheck
bun run test
bun run db:verify
bun run build
bun run dev
```

Then visit **http://localhost:3000**. For an actual local production-server test, stop dev and run `bun run start` after `bun run build`. The build scripts use portable Node file-copy operations, not Unix-only `cp`, `tee`, or inline environment assignments.

### Configure `.env.local`

**Required to show a real signed-in workflow:**
- `NEXT_PUBLIC_SUPABASE_URL`: staging project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: staging publishable/legacy anon key
- `SUPABASE_SERVICE_ROLE_KEY`: **staging secret, server only**
- `MODEL_API_KEY`: a valid Meta inference key, server only
- `REPORT_FIRST_INTAKE_ENABLED=true`
- `REPORT_FIRST_TRIAGE_ENABLED=true`

**Safety constraints:**
- `REPORT_FIRST_CRITICAL_PUBLICATION_ENABLED=false` — no unverified public critical publication.
- `REPORT_FIRST_ROLE_MANAGEMENT_ENABLED=false` until role-changing UI and real database permissions are verified.
- `SAM_API_KEY` and `GEMINI_API_KEY` are optional. Neither is necessary to demonstrate the primary Meta image analysis. Their absence must not break photo reporting.
- Optional tuning variables can stay empty to use explicit application defaults. Do not enable seed-on-production options.

**Important:** The example file is intended for **local/staging** setup. It is not permission to enable these flags on Production. Staging and production contain different users, roles and data. Ensure a test admin and reviewer exist in staging and have valid community event memberships.

### Two distinct test accounts

Use a reporter account and an independent reviewer/admin account in staging. Do not manually set an arbitrary user to admin, pass passwords through chat, or seed real-disaster evidence in production. If no administrator exists, see the owner's trusted CLI `scripts/bootstrap-admin.ts` and verify its preconditions before running it on a named test account in staging only.

## 3. Definition of a runnable demo

Test each step against the same staging project. Record status codes and redacted screenshots, not access tokens or private evidence URLs.

1. **Reporter login** at `/login`. No redirect loops or `account-unavailable`.
2. **Upload at `/reports/new`**: choose a rights-cleared JPEG/PNG/WebP, select GPS/manual/unknown location, submit with **no event selection**. Expect a saved report ID and a private original/derivative/thumbnail.
3. **AI analysis**: verify the returned model ID is Meta, the structured observation validates, and an `report_analyses` row exists for that report. Never confuse photo upload success with model success.
4. **Network and model recovery**: on temporary model failure, the saved report persists. Retry analysis on the same ID; do not re-upload the photo or exceed cost ceilings.
5. **Independent reviewer** at `/review`: authorized reviewer sees eligible low/moderate reports, but a reporter cannot mutate reviews. Critical or unclassified findings require admin. Save a decision and inspect the immutable audit history.
6. **Map** at `/map`: only correctly located and appropriately verified evidence is treated as confirmed; unknown-location reports do not get invented coordinates.
7. **Cross-user security**: reporter cannot view other reporters' private originals, review unrelated events or change roles. Invalid file, oversize file and expired session fail safely.
8. **UI accessibility**: Day, Mist, Night Ops, and Auto; keyboard, touch and responsive 320/375/768/1024/1440 px views. Confirm loading, errors and confirmation seals remain readable.

If any step fails, record it as **not verified**; revert the release hold only after fixing and retesting. Passing GitHub's mocked Vitest tests does **not** prove any of these live conditions.

## 4. Required checks before release

```powershell
bun run lint
bun run typecheck
bun run test
bun run build
```

Optional and potentially billable (only with explicit staging model credentials):
```powershell
bun run test:smoke
```

The existing `bun run test:e2e` suite is mainly a setup-state/unconfigured-environment test and is **not** a substitute for signed-in reporter and reviewer E2E coverage.

**Release gate:** a real report saved in staging; a real Meta result persisted to the database; a second authorized account can review it; the correct result appears in the map; private evidence remains inaccessible to outsiders; and the released Vercel deployment's Git SHA matches the reviewed, CI-passing commit.

For additional caveats and security findings, read [the critical audit](HACKATHON_CRITICAL_AUDIT_20261103.md).
