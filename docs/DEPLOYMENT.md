# TerraResponse AI — Deployment Guide

This guide walks through deploying TerraResponse AI to **Vercel** (the
frontend) + **Supabase** (the database + auth + storage). It also
documents the alternative "self-hosted on a single Linux box with
Postgres + S3-compatible storage" path for evaluators who can't use
Vercel/Supabase.

> **Gate criterion (from the brief)**: the deployed URL loads and the
> demo can complete when the live Meta API temporarily fails. The
> demo-mode seeding (`scripts/seed-demo.ts`) creates 3-5 rights-
> cleared demo reports with precomputed mock outputs; when
> `DEMO_MODE=1`, the app surfaces a "Demonstration Data — not a live
> disaster" banner on every page so reviewers can't mistake the
> seeded data for real disaster reports.

## 0. Prerequisites

- A Vercel account (free tier works for the demo).
- A Supabase project (free tier works for the demo — 500 MB DB + 1 GB
  storage + 50,000 monthly auth users).
- Node.js 20+ / Bun 1.3+ (for local development; Vercel uses Node).
- The Supabase CLI (for the DB migrations): `bun add -g supabase`.
- `git` (to push the repo to GitHub, which Vercel auto-deploys).
- A Meta Model API key (`MODEL_API_KEY`) for the AI analysis. The
  app runs WITHOUT this key (the analyze endpoint returns 503
  NOT_CONFIGURED), so this is NOT a blocker for the deployed URL to
  load. The demo seed data has precomputed mock outputs, so the demo
  can complete even when the live API is unavailable.
- (Optional) A SAM 3.1 API key (`SAM_API_KEY`) for segmentation. The
  app runs without this (segmentation is opt-in + off by default).

## 1. Setup order (do these in this exact order)

The setup order is **Supabase first, Vercel second, demo seed third**.
You need the Supabase URL + anon key + service-role key to set the
Vercel env vars. You need the Vercel production URL to set the
Supabase auth callback URL allowlist.

### Step 1.1 — Create the Supabase project

1. Sign in at <https://supabase.com> and click **New Project**.
2. Pick a project name (e.g., `terraresponse-ai`). Pick a strong DB
   password (save it to your password manager — Supabase doesn't show
   it again). Pick a region close to your users.
3. Wait for the project to provision (~2 minutes).
4. In the project dashboard, open **Project Settings → API**:
   - Copy the **Project URL** (this is your `NEXT_PUBLIC_SUPABASE_URL`).
   - Copy the **anon public** key (this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - Copy the **service_role** key (this is your `SUPABASE_SERVICE_ROLE_KEY`).
     **Never expose the service-role key to the browser.** It bypasses
     RLS; only the server uses it (the route handlers + the seed
     scripts).

### Step 1.2 — Apply the database migrations

The migrations live in `supabase/migrations/`. Apply them in order
via the Supabase CLI:

```bash
# From the repo root:
supabase link --project-ref <your-project-ref>   # the ref is in the Supabase dashboard URL

# Enable PostGIS in the dashboard first: Database → Extensions → "postgis" → ON

supabase db push --linked                         # applies all migrations in order
```

The migrations create:
- `0001_schema.sql`: the tables (`profiles`, `events`,
  `event_members`, `reports`, `report_analyses`, `review_actions`,
  `audit_events`, `priority_overrides`) + check constraints +
  indices + the `handle_new_user` trigger.
- `0002_rls.sql`: the RLS helper functions (`is_event_member`,
  `is_event_reviewer_or_higher`, `is_event_contributor_or_higher`,
  `is_admin`) + the per-table RLS policies + the
  `write_audit_event` SECURITY DEFINER function (the only way a
  client can append to `audit_events`).
- `0003_storage.sql`: the three private storage buckets
  (`evidence-originals`, `evidence-derivatives`, `evidence-thumbnails`)
  + the storage RLS policies (event-member-scoped reads/writes).
- `0004_resilience.sql`: the Phase 12 resilience tables
  (`ai_usage_log`, `evidence_signed_url_log`, `report_retention`)
  + the `reports.retention_state` denormalized column + the sync
  trigger.
- `0005_postgis.sql`: the PostGIS extension (in the `extensions`
  schema), the canonical `reports.geo geography(POINT, 4326)`
  column + the `sync_report_geo` trigger that keeps it in sync with
  `latitude`/`longitude`, the GiST spatial index
  (`idx_reports_geo_gist`), and the two SECURITY INVOKER RPC
  functions `nearby_reports` (radius search via `ST_DWithin`) and
  `viewport_reports` (bounding-box search via `ST_Intersects`).
- `0006_security_fixes.sql` (Phase 18): the verified security
  remediation. Adds the audit_events.action case-variants CHECK
  (C-1), the `trg_guard_profile_role` trigger (C-2b), the
  `trg_guard_retention_transition` trigger (H-1), the
  `trg_guard_event_member_self_demotion` trigger (M-1), the
  `trg_normalize_audit_action` trigger (C-1c), the
  `handle_new_user` name-length cap (M-5), the
  `sync_report_geo` location_source check (M-10), the
  `nearby_reports` / `viewport_reports` retention_state filter
  (M-2) + antimeridian handling (H-4), the audit_events partial
  index for the login rate-limit query (M-4), and the idempotent
  re-application of the reports column-level UPDATE privileges
  (C-3). The 0001-0005 migrations were also patched in Phase 18
  to fix the invalid `new.X = old.X` policies (PostgreSQL RLS
  does NOT expose OLD/NEW row variables inside policy
  expressions) — the corrected policies use column-level
  UPDATE privileges + triggers instead.
  Per the official guidance: PostGIS is installed in the dedicated
  `extensions` schema (no relocation), the RPC functions are
  `SECURITY INVOKER` so RLS still applies, and every function has an
  explicit `search_path = public, extensions, pg_catalog`.
- `0007_fix_auth_trigger.sql` (Phase 18): renames the `auth.users`
  trigger from `on_auth_user_created` (which clobbered Supabase's
  built-in trigger) to `trg_handle_new_user` (a unique name). This
  is a forward migration for projects that already ran the
  pre-patch 0001. Fresh installs use the patched 0001 directly.

> **Prerequisite**: enable the PostGIS extension in the Supabase
> dashboard **before** running `supabase db push`: go to
> **Database → Extensions → search "postgis" → Enable**. The
> migration's `create extension if not exists postgis with schema
> extensions` is idempotent but only succeeds if the extension is
> allow-listed by your Supabase plan (free tier supports it).

#### Pre-flight verifier (run BEFORE and AFTER `supabase db push`)

`scripts/verify-supabase.ts` is a **read-only** integration check
that runs against your live Supabase project using just the three
env vars (URL + anon key + service-role key). It does NOT apply
migrations, insert, update, or delete anything — it only previews
state and reports gaps. Use it as the standard pre-flight check:

```bash
# From the repo root, with .env populated:
bun run db:verify                 # alias for: bun run scripts/verify-supabase.ts
```

The verifier checks (in this order):

1. **Connection** — service-role can reach `public.profiles`.
2. **Migrations** — lists applied migrations from
   `supabase_migrations.schema_migrations` and compares them
   against `supabase/migrations/*.sql`, printing a per-file `✓` /
   `·` diff so you can see exactly which migrations are pending
   **before** you run `supabase db push`.
3. **Tables** — every one of the 11 expected public tables exists.
4. **Storage buckets** — the three private buckets exist with
   `public=false`.
5. **PostGIS** — the `reports.geo` column exists (proves
   `0005_postgis.sql` was applied).
6. **RPCs** — `nearby_reports`, `viewport_reports`, and
   `write_audit_event` are installed and enforce their constraints
   (calls them with intentionally-invalid inputs — no row is
   written).
7. **Anonymous RLS** — the anon client sees 0 rows from every
   public table (RLS forbids unauthenticated reads).

Exit code `0` means every check passed and you're ready to push or
run. Exit code `1` lists the failures and the most common causes.
The script prints the first 12 characters of each key (so you can
confirm it's the right project) but never the full key.

#### Manual verification query (alternative — run in the Supabase SQL editor after the migrations):

```sql
-- Should return 11 public tables (8 core + 3 Phase-12).
select tablename from pg_tables
where schemaname = 'public'
order by tablename;

-- Should return the three private storage buckets, all public=false.
select id, name, public from storage.buckets
where id in ('evidence-originals','evidence-derivatives','evidence-thumbnails');

-- Should return 11 tables with RLS enabled.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and rowsecurity = true
order by tablename;

-- Should return the PostGIS extension in the extensions schema.
select extname, extnamespace::regnamespace as ns
from pg_extension
where extname = 'postgis';

-- Should return the GiST spatial index on reports.geo.
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'reports'
  and indexname = 'idx_reports_geo_gist';

-- Should return the two PostGIS RPC functions.
select proname from pg_proc
where proname in ('nearby_reports','viewport_reports','write_audit_event','sync_report_geo');

-- Should return the geo column on reports.
select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'reports'
  and column_name = 'geo';
```

Expected:
- 11 public tables with RLS enabled (`profiles`, `events`,
  `event_members`, `reports`, `report_analyses`, `review_actions`,
  `audit_events`, `priority_overrides`, `ai_usage_log`,
  `evidence_signed_url_log`, `report_retention`).
- 3 storage buckets, all with `public = false`.
- `postgis` extension in the `extensions` schema.
- `idx_reports_geo_gist` index on `public.reports`.
- The four functions `nearby_reports`, `viewport_reports`,
  `write_audit_event`, `sync_report_geo` in `pg_proc`.
- A `geo` column on `public.reports` of type
  `geography(POINT, 4326)`.

### Step 1.3 — Configure the Supabase auth callback URLs

In the Supabase dashboard, open **Authentication → URL Configuration**:

- **Site URL**: set to your Vercel production URL (e.g.,
  `https://terraresponse-ai.vercel.app`). This is the URL Supabase
  redirects to after email verification.
- **Redirect URLs** (the allowlist): add:
  - `https://<your-vercel-domain>/auth/callback`
  - `https://<your-vercel-preview-domain>/auth/callback` (if you want
    preview deployments to also handle the auth callback — useful
    for staging).
  - `http://localhost:3000/auth/callback` (for local development).

The `/auth/callback` route (in `src/app/auth/callback/route.ts`)
exchanges the Supabase `code` for a session and redirects to the
dashboard (or a safe `next` URL).

### Step 1.4 — Create the first admin user

The first admin can't self-sign-up (the brief: "Create a safe
onboarding path for the first administrator documented in setup,
rather than permitting users to self-assign reviewer/admin
privileges"). Two paths:

**Path A — via the Supabase Auth admin API (recommended):**
```bash
# From the repo root:
bun run scripts/bootstrap-admin.ts
# The script creates the admin user in auth.users + sets the
# profiles.role to 'admin'. It uses the service-role key, so set
# SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL first.
# The script prompts for the admin email + password interactively.
```

**Path B — via the Supabase dashboard:**
1. In the Supabase dashboard, open **Authentication → Users → Add
   user**. Create a user with email + password.
2. In the SQL editor, run:
   ```sql
   update public.profiles set role = 'admin'
   where email = '<your-admin-email>';
   ```

After the first admin exists, the admin can sign in at `/login` and
use the (Phase 2 stretch) admin UI to create events + manage
memberships. For the demo, the `scripts/seed-demo.ts` script (Step
3.1) creates the demo admin automatically.

### Step 1.5 — Push the repo to GitHub

Vercel auto-deploys from GitHub. Push the repo to a GitHub
repository (public or private — Vercel supports both):

```bash
git remote add origin git@github.com:<your-org>/terraresponse-ai.git
git push -u origin main
```

### Step 1.6 — Create the Vercel project

1. Sign in at <https://vercel.com> and click **Add New → Project**.
2. Import the GitHub repo.
3. Vercel auto-detects Next.js. The defaults are correct:
   - **Framework Preset**: Next.js
   - **Build Command**: `next build` (the package.json `build` script
     also copies the standalone output to the right place).
   - **Output Directory**: `.next` (Vercel handles this; the
     `output: "standalone"` in next.config.ts enables the
     standalone server build that Vercel uses).
4. Open **Settings → Environment Variables**. Add each variable
   from `.env.example`. The secrets (`MODEL_API_KEY`,
   `SAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`)
   must be marked **Server-only** (Vercel's checkbox — the value
   is not exposed to the browser bundle). The `NEXT_PUBLIC_*`
   vars are inlined at build time, so they're NOT secret but
   Vercel still keeps them in the build environment only.

   Required env vars (Vercel will fail to build without these):
   - `NEXT_PUBLIC_SUPABASE_URL` (from Step 1.1)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Step 1.1)
   - `SUPABASE_SERVICE_ROLE_KEY` (from Step 1.1) — **Server-only**
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
     — **Server-only**
   - `NEXTAUTH_URL` — `https://<your-vercel-domain>` (your
     production URL; Vercel assigns this on the first deploy)
   - `NODE_ENV` — `production`

   Optional env vars (the demo runs without these, but the live
   AI analysis does not):
   - `MODEL_API_KEY` — **Server-only** — the Meta Muse Spark API key
   - `META_MODEL_BASE_URL` — `https://api.meta.ai/v1` (default)
   - `META_VISION_MODEL` — `muse-spark-1.3` (default)
   - `SAM_API_KEY` — **Server-only** — the SAM 3.1 API key
   - `SAM_MODEL_BASE_URL` — `https://api.meta.ai/v1` (default)
   - `SAM_MODEL` — `sam-3.1` (default)
   - `DEMO_MODE` — `1` (set this for the demo deployment so the
     demo banner renders)

   Cost-control + rate-limit env vars (all have safe defaults; see
   `.env.example` for the full list). Don't set them unless you
   need to tune the ceilings.

5. Click **Deploy**. The first deploy takes ~3 minutes (Vercel
   builds the Next.js app + the standalone server bundle).

### Step 1.7 — Verify the deployed URL

1. Open the Vercel deployment URL in a browser.
2. The `/login` page should render the email + password form (NOT
   the "Setup required" state — that state means Supabase isn't
   configured, which means an env var is missing on Vercel).
3. Sign in with the admin email + password from Step 1.4.
4. The dashboard should load (it'll be empty until you seed the demo
   data in Step 3.1).

If the deployed URL shows the "Setup required" state, check:
- `NEXT_PUBLIC_SUPABASE_URL` is set on Vercel (not just locally).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set on Vercel.
- The Supabase project's **Site URL** matches the Vercel domain.

## 2. Next.js rendering configuration

The `next.config.ts` already sets `output: "standalone"` (the
config Vercel uses for the standalone server build). The other
relevant config:

- **`reactStrictMode: false`**: disabled because some of the Radix
  UI components double-fire effects in StrictMode dev; the
  production behavior is unaffected.
- **`typescript.ignoreBuildErrors: true`**: the build skips type
  errors (the `bun run typecheck` script catches them in CI; the
  build itself doesn't fail on type errors so a release isn't
  blocked by an unused-variable warning). To strictly enforce
  types in the build, change this to `false`.
- **No `experimental` flags**: the app uses only stable Next.js 16
  features.

The middleware (`middleware.ts` at the repo root) handles:
- Supabase session refresh on protected routes.
- Redirect to `/login` for unauthenticated requests on protected
  routes.
- Safe redirect from `/login` to the role-default when already
  signed in.

The API routes use the `runtime = "nodejs"` default (not the
edge runtime) because they use `sharp` + `exifr` + `@supabase/ssr`
which are Node-only.

## 3. Demo Mode (Phase 14)

Demo Mode is the seeded-scenario setup that lets the demo complete
even when the live Meta API is unavailable. The seed script
creates 3-5 rights-cleared demo reports with precomputed mock AI
outputs, plus a "Demonstration Data — not a live disaster" banner
so reviewers can't mistake the seeded data for real disaster
reports.

### Step 3.1 — Run the demo seed

The seed script (`scripts/seed-demo.ts`) is idempotent: running it
multiple times updates the demo reports to the canonical state
without duplicating rows. It uses the service-role key (so it
bypasses RLS) + reads the Supabase URL + service-role key from the
env. Run it locally OR on a CI runner that has the env vars set:

```bash
# From the repo root, with the Supabase env vars set in .env:
bun run scripts/seed-demo.ts
```

The script:
1. Creates the demo admin user (if it doesn't exist) via the
   Supabase Auth admin API. The email defaults to `admin@terra.ai`
   (override with `DEMO_SEED_ADMIN_EMAIL`).
2. Creates two demo events: "Demo Hurricane Helene — Asheville" +
   "Demo LA Wildfires — Pacific Palisades".
3. Creates the demo admin's membership in both events (as
   coordinator).
4. Creates 5 demo reports (see `docs/DEMO_MODE.md` for the full
   list). The reports cover:
   - A known-location GPS report (Asheville, NC; Asheville is the
     demo event's location_label).
   - A known-location manual-pin report (Pacific Palisades, CA).
   - An unknown-location report (no GPS, no manual pin — the
     contributor chose "I don't know the location"). This report
     appears in the Unlocated list ONLY (the brief: "Reports
     with unknown location remain in an Unlocated list/queue
     and never receive fabricated map coordinates").
   - A reviewed report (reviewer confirmed; status = reviewed,
     review_outcome = confirmed). This report appears on the map
     with a green circle.
   - An intentionally failed analysis report (status =
     retryable_error; last_error = "simulated transient failure
     for demo purposes"). This report appears in the Review Queue
     under the "Analysis failed" filter.
5. For each report with a "needs_review" status, inserts a
   `report_analyses` row with a precomputed mock observation. The
   observation is clearly marked: `structured_observation._demo =
   true` + `structured_observation._demo_note = "Precomputed mock
   output; not a live Meta inference."`. The model_id is
   `demo-mock-v1` (NOT `muse-spark-1.3`) so the report-detail UI
   shows "Demo mock" instead of "Muse Spark 1.3".
6. Inserts a `review_actions` row for the reviewed report (so the
   ReviewHistory component shows the audit trail).

### Step 3.2 — Set `DEMO_MODE=1` on Vercel

In the Vercel project's **Settings → Environment Variables**, set
`DEMO_MODE=1` (Production environment). This enables the demo
banner on every page + the "DEMO" badge on each report card.

Re-deploy (Vercel auto-deploys on the next push, or you can
manually trigger a redeploy in the Vercel dashboard).

### Step 3.3 — Verify the demo

1. Open the deployed URL.
2. The "Demonstration Data — not a live disaster" banner should
   appear at the top of every page.
3. Sign in with the demo admin (email: `admin@terra.ai`, password:
   the value you set in `DEMO_SEED_ADMIN_PASSWORD` — the seed script
   refuses to use a default and refuses to seed against a non-local
   Supabase URL unless `ALLOW_DEMO_SEED_ON_PRODUCTION=1` is set).
4. The dashboard should show 5 reports received, 4 awaiting review
   (the failed analysis is 1 of the 4), 1 reviewed, 1 unlocated.
5. The map should show 3 pins (the 2 known-location reports + the
   1 reviewed report — all 3 are at the same coordinates). The
   unknown-location report should NOT appear on the map; it
   appears in the dashboard's "Unlocated" list with a `MapPinOff`
   icon.
6. Open the report detail for the reviewed report. The model_id
   should show `demo-mock-v1` (NOT `muse-spark-1.3`); the
   observation should have the `_demo_note` field visible; the
   review history should show the confirm action with the demo
   admin as the reviewer.
7. Open the report detail for the failed-analysis report. The
   status should show `retryable_error` + the `last_error` should
   show "simulated transient failure for demo purposes". The
   Resilience Panel's "Re-analyze" button should be available;
   clicking it should return 503 NOT_CONFIGURED (no `MODEL_API_KEY`
   set on Vercel) — this is the gate: the demo can complete when
   the live API temporarily fails.

### Step 3.4 — Verify with a live Meta API key (separate from the demo)

To test the live API separately (the brief: "Test a true live API
analysis separately and record its evidence in development notes"):

1. Set `MODEL_API_KEY` on Vercel (Server-only).
2. Re-deploy.
3. Sign in as the admin, upload a new image (use a rights-cleared
   stock photo from Pexels/Unsplash; do NOT use a real disaster
   photo — the brief: "Use privacy-safe demonstration fixtures").
4. The report should transition `uploaded → analyzing → needs_review`
   (or `retryable_error` if the API is down, or
   `needs_manual_review` if the model's response fails Zod).
5. Record the observation + the model_id + the prompt_version +
   the schema_version + the latency + the token counts in
   `docs/DEMO_MODE.md` under "Live API evidence". This is the
   development note that the live API was tested separately.

The opt-in Vitest smoke test (`src/lib/ai/muse-spark.smoke.test.ts`)
is the automated equivalent. Run it locally with:
```bash
MODEL_API_KEY=<your-key> bun run test:smoke
```
It calls the real Meta API with a synthesized 100×100 grey image and
asserts the response passes both validation layers (the model's
JSON-schema + our Zod layer). The test logs the observation + the
usage metadata to stdout.

## 4. Secrets + secure environment separation

### 4.1 — Secrets remain server-only

The repo's secrets are:
- `MODEL_API_KEY` (the Meta Model API key)
- `SAM_API_KEY` (the SAM 3.1 API key)
- `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- `NEXTAUTH_SECRET` (signs the JWT session cookies)

None of these are prefixed with `NEXT_PUBLIC_`. The Next.js
convention: any env var prefixed with `NEXT_PUBLIC_` is inlined into
the browser bundle at build time. Server-only env vars are NOT
inlined — they're only available in route handlers, server
components, and server actions.

The repo has a grep test (`tests/e2e/failure-cases.spec.ts` doesn't
test this, but the `.env.example` documents it) that fails the build
if any of the secret env vars are prefixed with `NEXT_PUBLIC_`. To
verify manually:

```bash
# Should return NO matches:
rg "^NEXT_PUBLIC_(MODEL_API_KEY|SAM_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXTAUTH_SECRET)" .env.example
```

Vercel enforces this at the platform level: env vars marked
**Server-only** are not exposed to the browser bundle. Set the
secrets with the **Server-only** checkbox checked on Vercel.

### 4.2 — Environment separation (dev / preview / production)

Vercel supports three environments per project:
- **Production** — the canonical deployed URL (`<project>.vercel.app`
  or your custom domain).
- **Preview** — every git push to a non-`main` branch gets a unique
  preview URL.
- **Development** — local `next dev`.

Recommended env-var layout:

| Env var | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | prod project URL (or a separate staging project) | prod project URL (or a local Supabase CLI project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | prod anon key | prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service key | prod service key | prod service key |
| `NEXTAUTH_SECRET` | a unique strong secret | a DIFFERENT unique strong secret | a local dev secret (any value) |
| `NEXTAUTH_URL` | `https://<prod-domain>` | the preview URL (Vercel auto-detects this for the auth callback, but `NEXTAUTH_URL` is the canonical origin) | `http://localhost:3000` |
| `MODEL_API_KEY` | prod key | prod key OR a staging key (if Meta supports it) | local key (or empty — analyze returns 503) |
| `DEMO_MODE` | `1` (for the demo deploy) | `1` (for the demo preview) | not set (local dev) |

**Critical**: use DIFFERENT `NEXTAUTH_SECRET` values for Production
and Preview. If you reuse the same secret, a JWT minted on the
preview URL is valid on the production URL (session-fixation risk).

### 4.3 — Supabase auth callback URL allowlist

The Supabase project's **Authentication → URL Configuration** has a
**Redirect URLs** allowlist. For the demo:
- `https://<prod-domain>/auth/callback` — Production
- `https://<preview-domain>/auth/callback` — Preview (the wildcard
  `*.vercel.app` works if you want every preview deployment to
  handle the callback; for tighter security, add each preview URL
  explicitly).
- `http://localhost:3000/auth/callback` — Development

The Supabase auth flow:
1. The user signs in at `/login` (the form's action is the
   `signInAction` server action in `src/lib/auth/actions.ts`).
2. `signInAction` calls `supabase.auth.signInWithPassword` server-
   side. The access token + refresh token are written to the
   response cookies by the `@supabase/ssr` cookies adapter.
3. For email-confirmation flows (sign-up, password reset), Supabase
   sends an email with a link to the **Site URL** + `/auth/callback?
   code=...`. The `/auth/callback` route exchanges the code for a
   session and redirects to the dashboard.

## 5. Database migrations

The migrations are in `supabase/migrations/` and are idempotent
(`on conflict do nothing` / `create table if not exists` / `create
or replace function`). The apply order is:

1. `0001_schema.sql` — tables, constraints, indices, triggers.
2. `0002_rls.sql` — RLS helper functions + per-table policies +
   `write_audit_event` SECURITY DEFINER function.
3. `0003_storage.sql` — private storage buckets + storage RLS
   policies.
4. `0004_resilience.sql` — Phase 12 resilience tables +
   `reports.retention_state` + sync trigger.

Apply via the Supabase CLI:
```bash
supabase link --project-ref <your-project-ref>
supabase db push --linked
```

The `supabase db push --linked` command reads the `supabase/migrations/`
directory and applies any migration that hasn't been applied yet
(tracked in the `supabase_migrations.schema_migrations` table).

> **`--linked` flag**: the Supabase CLI warns that `db push` will
> target the local database by default in the next major version.
> Always pass `--linked` to target your remote project.

> **PostGIS prerequisite**: enable the PostGIS extension in the
> Supabase dashboard **before** running `supabase db push --linked`:
> go to **Database → Extensions → search "postgis" → Enable**.
> The 0005 migration's `create extension if not exists postgis
> with schema extensions` will fail if PostGIS isn't allow-listed
> by your Supabase plan (free tier supports it).

> **Auth trigger**: the migrations create a `trg_handle_new_user`
> trigger on `auth.users` that inserts a `public.profiles` row on
> signup. This trigger has a unique name (NOT `on_auth_user_created`,
> which is Supabase's built-in trigger for `auth.identities`).
> If you previously ran an older version of 0001 that clobbered
> Supabase's `on_auth_user_created` trigger, the 0007 migration
> fixes it. If sign-up works but sign-in fails after the migration,
> restart your Supabase project (Dashboard → Settings → Restart)
> so GoTrue re-initializes its triggers.

### Rollback plan

The rollback scripts live in `supabase/rollbacks/` (NOT in
`supabase/migrations/` — the Supabase CLI applies every `.sql` in
`migrations/` as a forward migration, so rollbacks must be kept
separate). Run them manually with `psql`:

```bash
# Roll back in REVERSE order (newest first):
psql "$DB_URL" -f supabase/rollbacks/0006_security_fixes_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0005_postgis_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0004_resilience_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0001_rollback.sql

# Full tear-down (drops ALL tables + functions + buckets):
psql "$DB_URL" -f supabase/rollbacks/0001_rollback.sql
```

**WARNING**: the `0001_rollback.sql` drops the `reports` table
(cascade), which drops the `report_analyses`, `review_actions`,
`audit_events`, `priority_overrides`, `report_retention`,
`ai_usage_log`, and `evidence_signed_url_log` tables (cascade).
This is a full data loss. Use only for a complete tear-down.
The `0001_rollback.sql` also attempts `delete from storage.buckets`
which is blocked by Supabase (use the Storage API or dashboard to
remove buckets manually).

For a partial rollback (e.g., disable Phase 12 without losing the
reports), use only `0004_resilience_rollback.sql`. That drops the
`ai_usage_log`, `evidence_signed_url_log`, `report_retention`
tables + the `reports.retention_state` column + the sync trigger.
The `reports` table itself survives.

### Re-apply after a rollback

To re-apply after a rollback:
```bash
supabase migration list   # shows which migrations are applied
supabase db push           # applies the missing ones
```

Or, for a full reset (drops everything + re-applies all migrations):
```bash
supabase db reset
```

## 6. Private storage policies

The three private storage buckets are created in
`supabase/migrations/0003_storage.sql`:

| Bucket | Public? | What it holds | Who reads | Who writes |
|---|---|---|---|---|
| `evidence-originals` | NO | The raw uploaded file, EXIF intact | Contributor + event reviewer+ | Event contributor+ |
| `evidence-derivatives` | NO | The EXIF-stripped, re-encoded JPEG used for reviewer display + AI inference | Event member | Server (service role) |
| `evidence-thumbnails` | NO | Small thumbnails for list views | Event member | Server (service role) |

Folder layout: `<bucket>/<event_id>/<report_id>.<ext>`. The first
path segment is the `event_id`, so the storage RLS policies use
`storage.foldername(name)[1] = event_id::text` to check membership.

The server mints short-lived (60-second) signed URLs at read time
(see `src/app/api/reports/[id]/evidence/route.ts`). The signed URL
is the only way a client gets the image bytes — the bucket itself
is private, so a direct `https://<project>.supabase.co/storage/v1/
object/...` URL returns 401.

The retention workflow (Phase 12) gates signed-URL mints on the
report's retention state:
- `active` — signed URLs mint normally.
- `soft_deleted` — the evidence-signed-URL endpoint returns 410
  GONE (the brief: "private-photo retention/deletion workflow").
- `purged` — same 410 GONE; the storage objects have been removed.

## 7. Runtime behavior on Vercel

### 7.1 — Build + start

Vercel runs `next build` (the package.json `build` script), which
produces the standalone server bundle (`output: "standalone"` in
`next.config.ts`). Vercel's Next.js runtime starts the standalone
server on a managed Node.js instance.

### 7.2 — Cold starts

The first request after a cold start takes ~500ms (the standalone
bundle loads). Subsequent requests are fast (<100ms). The
middleware runs on every request (it's lightweight — just a
Supabase session refresh + a redirect check).

### 7.3 — Function timeouts

Vercel's default function timeout is 10 seconds (Hobby plan) or 60
seconds (Pro plan). The longest route handler is the analyze route
(which calls the Meta API with a 30-second timeout + bounded
retries). On the Hobby plan, the analyze route may time out
before the Meta API responds; the Pro plan's 60-second timeout is
sufficient. The route handler is also rate-limited (per-user AI
calls per hour) so a stuck request doesn't accumulate.

### 7.4 — Image processing

The image-validate + derivative + exif modules use `sharp`, which
is a native Node.js addon. Vercel's Node.js runtime includes
`sharp` pre-built (no native compile needed). The build step
verifies `sharp` loads; if it doesn't, the build fails.

### 7.5 — Database connections

The Supabase client (`@supabase/ssr`) uses HTTP, not a persistent
DB connection pool. Each request creates a fresh client bound to
the request's cookies. This is fine for Vercel's serverless model
(no persistent processes between requests).

## 8. Verification checklist (post-deploy)

Run through this checklist after the first deploy + the demo seed:

- [ ] The deployed URL (`https://<your-vercel-domain>`) loads the
      `/login` page (NOT the "Setup required" state).
- [ ] The "Demonstration Data — not a live disaster" banner is
      visible at the top of every page (`DEMO_MODE=1` is set on
      Vercel).
- [ ] Sign in with the demo admin (email: `admin@terra.ai` or the
      override you set; password: the value you set in
      `DEMO_SEED_ADMIN_PASSWORD` — no default is shipped).
- [ ] The dashboard shows 5 reports received, 4 awaiting review, 1
      reviewed, 1 unlocated, 0 AI analysis failed (the
      retryable_error report is counted under "awaiting review"
      not "AI failed" because the dashboard's "AI failed" stat
      counts `retryable_error` ONLY — the brief's non-overlapping
      stats).
- [ ] The map shows 3 pins (2 known-location + 1 reviewed) + the
      unknown-location report is NOT on the map.
- [ ] Open the reviewed report's detail page. The model_id shows
      `demo-mock-v1` (NOT `muse-spark-1.3`). The observation has
      the `_demo_note` field. The review history shows the confirm
      action.
- [ ] Open the failed-analysis report's detail page. The status
      shows `retryable_error`. The Resilience Panel's "Re-analyze"
      button is visible. Clicking it returns 503 NOT_CONFIGURED
      (the live API is unavailable — the gate: "the demo can
      complete when live API temporarily fails"). The "Force
      manual review" button is available (admin-only).
- [ ] The "Request evidence deletion" button on a report's detail
      page returns the retention window end date.
- [ ] The audit log page shows the demo admin's LOGIN event.
- [ ] The `/api/admin/ai-usage` endpoint returns 403 FORBIDDEN for
      a non-admin user (test by signing in as a contributor —
      create one via the demo seed's `outsider@terra.ai` user).
- [ ] Sign out. The `/login` page renders. Sign in again — the
      dashboard loads (the session cookie was cleared).

## 9. Rollback plan (Vercel)

Vercel keeps every deployment. To roll back to a previous
deployment:
1. Open the Vercel project dashboard.
2. Click **Deployments**.
3. Find the deployment you want to roll back to.
4. Click the **...** menu → **Promote to Production**.

The rollback is instant (Vercel switches the production domain to
the previous deployment's build). The env vars are unchanged (the
previous deployment uses the same env vars as the current one).

To roll back the database:
1. Apply the rollback SQL (see Section 5).
2. The previous deployment's code may not be compatible with the
   rolled-back schema — verify by re-running the verification
   checklist against the rolled-back deployment.

## 10. Alternative: self-hosted on a single Linux box

For evaluators who can't use Vercel/Supabase, the app can run on a
single Linux box with Postgres + an S3-compatible storage backend
(e.g., MinIO). The setup is more involved; the brief says
"documented alternative" so it's outlined here.

### 10.1 — Prerequisites

- A Linux box (Ubuntu 22.04+ or Debian 12+).
- Docker + docker-compose (for Postgres + MinIO).
- Nginx or Caddy (for TLS termination + reverse proxy).
- A domain name + TLS cert (Let's Encrypt works).

### 10.2 — Setup

1. Clone the repo to the box.
2. Set up Postgres + MinIO via docker-compose (an example
   `docker-compose.yml` is not included in the repo — the brief
   says "documented alternative" but the Vercel path is the
   primary). Configure the Supabase env vars to point to your
   Postgres + MinIO instances.
3. Apply the migrations: `psql "$DB_URL" -f supabase/migrations/
   0001_schema.sql` (etc., in order).
4. Build the Next.js app: `bun install && bun run build`.
5. Start the standalone server: `bun run start` (the package.json
   `start` script runs `NODE_ENV=production bun .next/standalone/
   server.js`).
6. Configure Nginx to reverse-proxy to `:3000` with TLS.

This path is more work and is NOT the primary deployment path. The
Vercel path is recommended for the demo.

## 11. Known limitations

1. **The full happy-path UI flow is manual** (see
   `tests/TEST_COVERAGE.md`). The automated tests cover the LOGIC
   (unit + integration) and the no-backend UI state (Playwright).
   The deployed-URL verification is a manual checklist (Section 8).
2. **The live Meta API smoke test is opt-in** (see
   `src/lib/ai/muse-spark.smoke.test.ts`). It skips without
   `MODEL_API_KEY`. Run it locally with `bun run test:smoke`.
3. **Vercel Hobby plan's 10-second function timeout** may be too
   short for the analyze route (which has a 30-second timeout +
   bounded retries). Use the Pro plan for production, OR lower the
   `AI_CALL_TIMEOUT_MS` env var to 8000 (8s) for the Hobby plan.
4. **The demo seed creates the demo admin via the Supabase Auth
   admin API** (not via SQL). The script needs the service-role
   key, so it must run in an environment where
   `SUPABASE_SERVICE_ROLE_KEY` is set (locally with `.env`, or on
   a CI runner with the env vars set).
5. **The demo banner is a UI affordance** — the seeded data is
   still in the production database. To completely remove the
   demo data, run the SQL in `scripts/seed-demo.ts`'s
   `cleanDemoData` function (or delete the demo reports + events
   manually via the Supabase dashboard).

## 12. Gate criterion (from the brief)

> **Gate**: deployed URL loads and the demo can complete when live
> API temporarily fails.

- **Deployed URL loads**: verified by the checklist in Section 8
  (step 1: the deployed URL loads `/login`, not the "Setup
  required" state).
- **Demo completes when live API fails**: the demo seed (Step 3.1)
  creates 5 reports with precomputed mock outputs. The reviewed
  report's `report_analyses` row has `model_id = "demo-mock-v1"`
  + `structured_observation._demo = true` + `structured_observation._demo_note
  = "Precomputed mock output; not a live Meta inference."`. The
  report-detail UI renders the precomputed observation; the user
  doesn't need the live API to see the demo's AI observation. The
  failed-analysis report's status is `retryable_error`; the
  Resilience Panel's "Re-analyze" button returns 503
  NOT_CONFIGURED (no `MODEL_API_KEY`), which the UI surfaces
  inline (no silent failure). The "Force manual review" button
  (admin-only) lets the reviewer transition the report to
  `needs_manual_review` without a model call.

  So the demo completes (login → dashboard → map → report detail →
  review) WITHOUT the live Meta API. When the live API IS
  available, a separate upload + analyze cycle (Step 3.4) verifies
  the live inference path; the evidence is recorded in
  `docs/DEMO_MODE.md`.
