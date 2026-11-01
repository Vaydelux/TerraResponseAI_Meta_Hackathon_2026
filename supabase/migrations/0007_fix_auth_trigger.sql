-- TerraResponse AI: reconcile the legacy auth-user profile trigger safely.
--
-- Older installs named our public.handle_new_user trigger
-- "on_auth_user_created"; new installs name it "trg_handle_new_user".
-- Never drop or overwrite an auth.users trigger belonging to Supabase
-- Auth or another integration. Abort instead, and require manual review.
--
-- This migration is forward-only; run on isolated staging first.
-- Both fresh and legacy installations converge on one app-owned trigger.

do $safe_trigger_migration$
declare
  app_function oid := 'public.handle_new_user()'::regprocedure;
  legacy_function oid;
  desired_function oid;
begin
  select t.tgfoid into legacy_function
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal;

  if legacy_function is not null and legacy_function <> app_function then
    raise exception 'Refusing to drop auth.users.on_auth_user_created: not owned by TerraResponse AI';
  end if;

  select t.tgfoid into desired_function
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'trg_handle_new_user'
      and not t.tgisinternal;

  if desired_function is not null and desired_function <> app_function then
    raise exception 'Refusing to replace auth.users.trg_handle_new_user: unexpected function';
  end if;

  if legacy_function is not null then
    execute 'drop trigger on_auth_user_created on auth.users';
  end if;

  if desired_function is null then
    execute 'create trigger trg_handle_new_user after insert on auth.users for each row execute function public.handle_new_user()';
  end if;
end;
$safe_trigger_migration$;

-- A Supabase Auth installation may have separate provider-owned triggers
-- or procedures. Never guess, recreate or delete those blindly.
-- After staging migration, verify Auth identities, confirmation callbacks
-- and profile creation with real staging accounts. Uncertainty requires
-- investigation of provider logs and catalog state, not mass trigger drops.
