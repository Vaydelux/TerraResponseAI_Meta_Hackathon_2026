# TerraResponse AI — Database & RLS

> Production database layer for TerraResponse AI. Targets **PostgreSQL
> 14+ / Supabase**. The sandbox dev environment uses Prisma + SQLite
> (see `docs/DECISIONS.md` ADR-003); these SQL migrations are the
> production-target set that runs against a real Postgres/Supabase
> instance.

## 1. What's here

```
supabase/
├── README.md                      # this file
├── seed.sql                       # minimal seed scaffolding (4 users, 2 events, 1 report)
├── migrations/
│   ├── 0001_schema.sql             # tables, check constraints, indices, triggers
│   ├── 0002_rls.sql                # RLS helper functions + per-table policies
│   ├── 0003_storage.sql            # private storage buckets + event-member policies
│   └── 0001_rollback.sql           # full rollback (drops everything)
└── tests/
    └── test_rls.sql                # negative + positive RLS tests (16 scenarios)
```

## 2. Entity-Relationship Diagram

```
                        ┌─────────────────────┐
                        │   auth.users         │  (Supabase Auth — managed)
                        │   id  uuid  PK       │
                        └──────────┬──────────┘
                                   │ 1:1 (trigger handle_new_user)
                                   ▼
                        ┌─────────────────────┐
                        │   profiles          │  global role: reporter|reviewer|admin
                        │   id  uuid  PK ──────┼──┐
                        │   email             │  │
                        │   name              │  │
                        │   role              │  │
                        │   created_at        │  │
                        │   updated_at        │  │
                        └──────────┬──────────┘  │
                                   │             │
              ┌────────────────────┘             │
              │ FK (creator, member, reviewer,    │
              │ overridden_by, actor)             │
              │                                   │
   ┌──────────▼──────────────┐      ┌─────────────▼──────────┐
   │   events                │      │   event_members        │
   │   id  uuid  PK          │◄─────│   event_id  FK ───┐    │
   │   slug  unique          │ 1:N  │   user_id   FK ──┼──┐  │
   │   name                  │      │   role            │  │  │
   │   status                │      │   (contributor|   │  │  │
   │   bbox_*                │      │    reviewer|      │  │  │
   │   created_by  FK ────────┼──────│    coordinator)   │  │  │
   │   created_at/updated_at │      │   unique(event,user)  │
   │   closed_at             │      └──────────────────┘   │
   └──────────┬──────────────┘                              │
              │ 1:N                                          │
              ▼                                              │
   ┌─────────────────────────┐      ┌────────────────────┐   │
   │   reports               │      │   report_analyses  │   │
   │   id  uuid  PK           │ 1:1 │   id  uuid  PK      │   │
   │   event_id  FK ──────────┤      │   report_id  FK ───┤   │
   │   creator_id  FK ────────┤      │   model_id          │   │
   │   status                 │      │   prompt_version   │   │
   │   review_outcome         │      │   schema_version   │   │
   │   title / description    │      │   structured_      │   │
   │   latitude / longitude   │      │     observation    │   │
   │   location_source        │      │   severity_score   │   │
   │   original_storage_key   │      │   severity_        │   │
   │   derivative_storage_key │      │     uncertainty    │   │
   │   thumbnail_storage_key │      │   raw_usage_       │   │
   │   sha256                 │      │     metadata       │   │
   │   image_mime_type        │      │   processing_status │   │
   │   image_bytes / w / h    │      │   error_message    │   │
   │   captured_at            │      │   created_at/      │   │
   │   uploaded_at            │      │     updated_at     │   │
   │   priority_score         │      │   completed_at    │   │
   │   retry_count            │      └────────────────────┘   │
   │   next_retry_at         │                               │
   │   last_error            │      ┌────────────────────┐   │
   │   created_at/updated_at │      │   review_actions   │   │
   └──────────┬──────────────┘      │   id  uuid  PK      │   │
              │ 1:N                  │   report_id  FK ───┤   │
              ├─────────────────────►│   reviewer_id FK ──┼───┘
              │ 1:N                   │   action            │
              ├─────────────────────►│   previous/new_*    │
              │ 1:N                   │   (status, obs,    │
              └─────────────────────►│    severity)       │
                                      └────────────────────┘
   ┌─────────────────────────┐      ┌────────────────────┐
   │   priority_overrides    │      │   audit_events      │
   │   id  uuid  PK           │      │   id  uuid  PK      │
   │   report_id  FK ─────────┤      │   actor_id  FK ──┐  │
   │   overridden_by  FK ────┤      │   action          │  │
   │   previous_score        │      │   target_id      │  │
   │   new_score             │      │   target_type    │  │
   │   reason                │      │   metadata       │  │
   │   created_at            │      │   ip / user_agent │  │
   └─────────────────────────┘      │   created_at    │  │
                                    └────────────────┘  │
                                                         │
   actor_id, reviewer_id, overridden_by, creator_id, ─────┘
   created_by all reference profiles(id)
```

**Cardinality summary**

| From | To | Relation | On delete |
|---|---|---|---|
| profiles | auth.users | 1:1 (extends) | cascade |
| events | profiles (created_by) | N:1 | restrict |
| event_members | events | N:1 | cascade |
| event_members | profiles | N:1 | cascade |
| reports | events | N:1 | restrict (don't delete events with reports) |
| reports | profiles (creator) | N:1 | cascade |
| report_analyses | reports | 1:1 | cascade |
| review_actions | reports | N:1 | cascade |
| review_actions | profiles (reviewer) | N:1 | restrict (preserve audit) |
| priority_overrides | reports | N:1 | cascade |
| priority_overrides | profiles (overridden_by) | N:1 | restrict |
| audit_events | profiles (actor) | N:1 | set null (trail survives) |

## 3. Run / rollback

### Option A — Supabase CLI (recommended)

```bash
# 1. Link to your Supabase project (one-time)
supabase link --project-ref <your-project-ref>

# 2. Apply the migrations in order
supabase db push
# (equivalent: supabase migration up)

# 3. Seed the demo data (uses the service role; bypasses RLS)
supabase db seed            # runs supabase/seed.sql
# NOTE: on a hosted Supabase project, `supabase db seed` may fail on
# the `auth.users` direct INSERT. Use `bun run db:seed-demo` instead
# (uses the Supabase Auth admin API — the supported path).

# 4. Run the RLS tests (requires psql + the database URL)
psql "$(supabase db url)" -v ON_ERROR_STOP=0 -f supabase/tests/test_rls.sql
# Or run individual queries via the Supabase CLI:
#   supabase db query --linked "select count(*) from public.profiles"

# Rollback everything (destructive — drops all tables/functions/buckets)
# NOTE: rollbacks are in supabase/rollbacks/ (NOT in migrations/ —
# the Supabase CLI applies every .sql in migrations/ as a forward
# migration). Run manually with psql:
psql "$(supabase db url)" -f supabase/rollbacks/0001_rollback.sql
```

### Option B — psql against a raw Postgres + Supabase auth schema

```bash
export DB_URL="postgresql://postgres:<password>@<host>:5432/postgres"

# Apply in order
psql "$DB_URL" -f supabase/migrations/0001_schema.sql
psql "$DB_URL" -f supabase/migrations/0002_rls.sql
psql "$DB_URL" -f supabase/migrations/0003_storage.sql

# Seed
psql "$DB_URL" -f supabase/seed.sql

# Test
psql "$DB_URL" -v ON_ERROR_STOP=0 -f supabase/tests/test_rls.sql

# Rollback
psql "$DB_URL" -f supabase/migrations/0001_rollback.sql
```

> The migrations assume the Supabase auth schema (`auth.users`,
> `auth.uid()`, `auth.jwt()`) exists. On vanilla Postgres without
> Supabase, you'd need to stub these — not supported.

### Sandbox note

The sandbox dev environment uses **Prisma + SQLite** (per the
planning gate, `docs/DECISIONS.md` ADR-003). These SQL migrations
**cannot run in the sandbox** — there is no Postgres instance. They
are the production-target set. To verify them locally, run them
against a local Supabase instance (`supabase start`) or a cloud
Supabase project.

## 4. Seed users

The seed (`supabase/seed.sql`) creates four demo users with fixed
UUIDs so the RLS tests can reference them:

| User | UUID | Global role | Event membership |
|---|---|---|---|
| Alice (reporter@terra.ai) | `11111111-1111-1111-1111-111111111111` | reporter | Event A — contributor |
| Bob (reviewer@terra.ai) | `22222222-2222-2222-2222-222222222222` | reviewer | Event A — reviewer |
| Carol (admin@terra.ai) | `33333333-3333-3333-3333-333333333333` | admin | Event B — coordinator |
| Dave (outsider@terra.ai) | `44444444-4444-4444-4444-444444444444` | reporter | Event B — contributor |

Dave is the **"second unaffiliated user"** for the cross-event gate
test: he's in Event B and must NOT see Event A's reports or evidence.

> The seed inserts rows into `auth.users` directly via SQL, which
> requires the postgres/service role. In a real Supabase project
> you'd create users via `supabase.auth.admin.createUser()` in a JS
> script (the `handle_new_user` trigger creates the profile). The SQL
> approach is for testing only.

## 5. RLS policy summary

Every table has RLS enabled. The policies enforce:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | self OR admin | self (id = auth.uid()) | self (no role change) OR admin | admin |
| events | event member OR admin | admin | event coordinator OR admin | admin |
| event_members | event member OR admin | event coordinator OR admin | event coordinator OR admin | event coordinator OR admin |
| reports | creator OR event reviewer+ OR admin | event contributor+ (self as creator) | creator (pre-review, no verify) OR event reviewer+ (trusted fields locked) OR admin | creator (pre-review) OR admin |
| report_analyses | via parent report | event reviewer+ (manual) | admin only (service role for retries) | admin only |
| review_actions | via parent report | reviewer+ (NOT self) OR admin | **none** (append-only) | **none** (append-only) |
| priority_overrides | report creator OR event coordinator+ OR admin | event coordinator+ (self, with reason) | **none** (append-only) | **none** (append-only) |
| audit_events | **admin only** | via `write_audit_event()` function only | **none** (append-only) | **none** (append-only) |

> **Append-only enforcement**: `review_actions`, `priority_overrides`,
> and `audit_events` have NO `for update` or `for delete` policy. With
> RLS enabled and no matching policy, Postgres denies the operation by
> default. `audit_events` additionally has direct INSERT/UPDATE/DELETE
> revoked from `authenticated`, so the only way to append is via the
> `write_audit_event()` SECURITY DEFINER function (which forces
> `actor_id = auth.uid()`).
>
> **Trusted-field protection on reports**: the
> `reports_update_event_reviewer_or_admin` policy has a `with check`
> that forbids changing `event_id`, `creator_id`, `sha256`,
> `original_storage_key`, `derivative_storage_key`,
> `thumbnail_storage_key`, `image_mime_type`, `image_bytes`,
> `image_width`, `image_height`, `captured_at`, `uploaded_at` — so a
> reviewer can change `status` / `review_outcome` / `priority_score`
> / retry fields but cannot swap the evidence or re-assign the report.

**Key rules enforced by RLS (not the UI):**

1. **No unauthenticated reads** — every SELECT policy requires
   `auth.uid()` to match a profile or `is_admin()`.
2. **No cross-event reads** — report/anlysis/review SELECT policies
   filter by `is_event_reviewer_or_higher(event_id)`, which checks
   `event_members` for the specific `event_id`.
3. **Contributors cannot mark verified** — the `reports_update_creator_
   pre_review` policy has `with check (new.status not in ('reviewed')
   and new.review_outcome is null)`.
4. **Only reviewers/admins record verification** — `review_actions_
   insert_reviewer_not_self` requires `is_event_reviewer_or_higher`.
5. **No self-review** — `review_actions_insert_reviewer_not_self`
   requires `r.creator_id <> auth.uid()`.
6. **Only coordinators/admins override priority** —
   `priority_overrides_insert_coordinator_or_admin` requires
   `is_event_coordinator_or_admin(event_id)`.
7. **Audit is append-only** — direct INSERT/UPDATE/DELETE revoked;
   only `write_audit_event()` (SECURITY DEFINER) can append.

## 6. Storage & signed URLs

Three **private** storage buckets (no public read):

| Bucket | Contents | Read | Write |
|---|---|---|---|
| `evidence-originals` | raw upload, EXIF intact | event reviewer+ | event contributor+ (upload) |
| `evidence-derivatives` | EXIF-stripped, re-encoded JPEG | event member | service role (server-side sharp) |
| `evidence-thumbnails` | small thumbnail | event member | service role |

**Folder layout**: `<bucket>/<event_id>/<report_id>.<ext>`. The first
path segment is the `event_id`, so the storage policies can check
event membership via `(storage.foldername(name))[1] = event_id::text`.

**Signed URLs**: the Next.js server mints short-lived signed URLs
(60s TTL) using the service-role key (server-side only — never in the
browser). The server first checks `requireUser` + `canAccessReport`
(app-layer authz), then mints the URL and hands it to the authorized
client. The bucket is private; the signed URL is the only way in.

```typescript
// Server-side only (route handler)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await supabase.storage
  .from('evidence-derivatives')
  .createSignedUrl(`${eventId}/${reportId}.jpg`, 60);  // 60-second TTL
```

The service-role key bypasses RLS; the app-layer authz is the gate.
Never expose the service-role key to the client (see `docs/SECURITY.md`
§7).

## 7. Test scenarios

`supabase/tests/test_rls.sql` runs 17 scenarios. The gate criteria from
the brief map to:

| Gate | Test |
|---|---|
| no public evidence objects | TEST 15 (anon sees 0 evidence-originals) |
| RLS verified for a second unaffiliated user | TEST 3 (Dave cannot read Alice's Event A report) + TEST 16 (Dave cannot read Event A originals) |
| no unauthenticated reads | TEST 1 (anon sees 0 of everything) |
| no cross-event reads | TEST 2 (Alice sees Event A, not B) + TEST 3 |
| contributor cannot mark verified | TEST 7 (Alice cannot set status=reviewed) |
| only reviewers/admins record verification | TEST 8 (Bob can) + TEST 9 (Bob cannot review Event B report — now a real test with the seeded Event B report) |
| no self-review | TEST 10 (Alice cannot review own report) |
| only coordinator/admin overrides priority | TEST 11 (Alice cannot) + TEST 11b (Dave cannot override on own-event report — contributor, not coordinator) + TEST 12 (Carol/admin can) |
| audit append-only | TEST 13 (no UPDATE/DELETE) + TEST 14 (Alice cannot read) |

Run the tests and grep for `FAIL:` — any FAIL means a policy gap.

```bash
psql "$DB_URL" -v ON_ERROR_STOP=0 -f supabase/tests/test_rls.sql 2>&1 | grep -E '^(PASS|FAIL):'
```

## 8. Relationship to the Prisma schema

The sandbox dev environment uses `prisma/schema.prisma` + SQLite. The
SQL migrations here are the **production Postgres/Supabase** equivalent.
The two schemas are kept in sync by hand; a future Phase 6 task can
generate the SQL from the Prisma schema via
`bunx prisma migrate diff --from-empty --to-schema-datamodel
prisma/schema.prisma --script` and reconcile with these hand-written
migrations (the hand-written version is the source of truth for RLS,
which Prisma cannot express).

## 9. Adding a new migration

```bash
# 1. Create the file
touch supabase/migrations/0004_<name>.sql

# 2. Write the SQL (DDL + RLS policies)

# 3. Add the rollback to 0001_rollback.sql (or a new rollback file)

# 4. Add a test scenario to tests/test_rls.sql

# 5. Apply: supabase db push
```

Numbering: `0001_schema`, `0002_rls`, `0003_storage` are the initial
set. New migrations append `0004_…`, `0005_…`. The rollback file
(`0001_rollback.sql`) currently rolls back everything; if migrations
accumulate, split into per-migration rollbacks.
