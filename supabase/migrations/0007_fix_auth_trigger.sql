-- 0007_fix_auth_trigger.sql
-- ============================================================================
-- Phase 18 — Fix the auth.users trigger name collision with Supabase
-- ============================================================================
-- The original 0001_schema.sql (before the Phase 18 patch) used:
--
--   drop trigger if exists on_auth_user_created on auth.users;
--   create trigger on_auth_user_created
--     after insert on auth.users
--     for each row execute function public.handle_new_user();
--
-- This CLOBBERS Supabase's built-in `on_auth_user_created` trigger,
-- which is responsible for creating the `auth.identities` row on
-- signup. Without that row, GoTrue rejects the login — new users
-- can sign up but cannot sign in.
--
-- This migration:
--   1. Drops our trigger named `on_auth_user_created` (if it exists
--      and points to our function).
--   2. Recreates it with the unique name `trg_handle_new_user`.
--   3. Does NOT re-create Supabase's `on_auth_user_created` — that
--      trigger is managed by GoTrue. If it was clobbered by 0001,
--      the operator should restart their Supabase project
--      (Dashboard → Settings → Restart Project) so GoTrue
--      re-initializes its triggers. If restart doesn't fix it,
--      contact Supabase support.
--
-- The patched 0001_schema.sql (for fresh installs) already uses the
-- unique name `trg_handle_new_user` and does NOT drop Supabase's
-- trigger. This 0007 migration is only needed for projects where
-- the original (pre-patch) 0001 already ran.
-- ============================================================================

-- 1. Drop our trigger that's masquerading as Supabase's
--    `on_auth_user_created`. The `if exists` guard means this is a
--    no-op on projects where 0001 hasn't run (or where 0001 was
--    already patched).
drop trigger if exists on_auth_user_created on auth.users;

-- 2. Create our trigger with a unique name. This is the same trigger
--    the patched 0001 creates; the 0007 is the forward-migration
--    path for projects that already ran the unpatched 0001.
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Note: Supabase's `on_auth_user_created` trigger (which creates
--    the `auth.identities` row) was clobbered by the original 0001.
--    GoTrue may re-create it on the next signup attempt or on
--    project restart. If sign-up works but sign-in fails with
--    "no identities row", restart the project:
--      Dashboard → Project Settings → General → Restart Project
--    If that doesn't fix it, the operator can manually re-create
--    Supabase's trigger (the function lives in the `auth` schema;
--    check `pg_proc` for the function `on_auth_user_created` uses).

-- ============================================================================
-- End of 0007_fix_auth_trigger.sql
-- ============================================================================
