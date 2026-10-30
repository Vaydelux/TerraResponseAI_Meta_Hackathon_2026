# supabase/migrations

SQL migration files for the TerraResponse AI database. See
[`../README.md`](../README.md) for the full documentation, run
instructions, entity-relationship diagram, and RLS policy summary.

## Files

| File | Purpose |
|---|---|
| `0001_schema.sql` | Tables, check constraints, indices, updated_at triggers, auth-user trigger |
| `0002_rls.sql` | RLS helper functions + per-table SELECT/INSERT/UPDATE/DELETE policies + audit append-only function |
| `0003_storage.sql` | Private storage buckets + event-member storage policies |
| `0001_rollback.sql` | Full rollback — drops everything in reverse dependency order |

## Apply order

```
0001_schema.sql  →  0002_rls.sql  →  0003_storage.sql
```

Then seed: `supabase/seed.sql`. Then test: `supabase/tests/test_rls.sql`.

## Rollback

```
0001_rollback.sql
```

Destructive — drops all tables, functions, triggers, and storage
buckets created by the three forward migrations.

## Sandbox note

The sandbox dev environment uses Prisma + SQLite (`prisma/schema.prisma`)
per the planning gate (`docs/DECISIONS.md` ADR-003). These SQL
migrations target PostgreSQL 14+ / Supabase and cannot run in the
sandbox. Run them against a local Supabase instance (`supabase start`)
or a cloud Supabase project. See [`../README.md` §3](../README.md#3-run--rollback)
for run instructions.
