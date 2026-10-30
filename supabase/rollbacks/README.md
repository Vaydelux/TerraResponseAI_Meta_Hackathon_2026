# supabase/rollbacks

Manual teardown scripts for the forward migrations in `../migrations/`.

## Why these are NOT in `migrations/`

The Supabase CLI (`supabase db push`) applies every `.sql` file in
`supabase/migrations/` in alphabetical order. Rollback files like
`0001_rollback.sql` sort BEFORE their forward counterpart
(`0001_schema.sql`), so the CLI would try to apply the rollback
FIRST, then the forward migration — which is wrong and would fail
(e.g. `delete from storage.buckets` is blocked by Supabase's
storage admin role).

## When to use these

Only for manual teardown in a dev/staging environment, e.g.:

```bash
# Apply rollbacks in REVERSE order (newest first):
psql "$DB_URL" -f supabase/rollbacks/0006_security_fixes_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0005_postgis_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0004_resilience_rollback.sql
psql "$DB_URL" -f supabase/rollbacks/0001_rollback.sql
```

## Supabase-specific gotchas

- `delete from storage.buckets` is blocked by Supabase (the
  `supabase_storage_admin` role owns the table). Use the Storage
  API or the dashboard to remove buckets.
- `auth.users` direct INSERTs require the `service_role` key +
  bypass RLS. Use `supabase.auth.admin.createUser()` in a JS
  script instead (see `scripts/seed-demo.ts`).
- Never run rollbacks against a production database without a
  backup. The forward migrations are designed to be forward-only;
  rollbacks are a dev convenience.

## Forward-only migration policy

Per the Supabase convention, the forward migrations in
`../migrations/` are NEVER modified after they've been applied to
any environment. If a fix is needed, write a new
`0007_<fix>.sql` migration that uses `drop policy if exists` /
`create or replace function` / `alter table` to apply the
correction in-place. This preserves the migration history so
every environment has the same ledger.
