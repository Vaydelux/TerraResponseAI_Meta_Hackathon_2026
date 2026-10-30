-- Hardening: remove the implicit PUBLIC EXECUTE on privileged helpers.
-- Run after the existing security, RLS and grant migrations on isolated STAGING.
-- Trigger functions never need direct execution by API clients.
-- All caller-facing SECURITY DEFINER helpers continue to require an
-- authenticated session and their own uid/role checks.

create or replace function public.event_role(
  p_event_id uuid, p_user_id uuid default auth.uid()
)
returns text
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select em.role
    from public.event_members em
   where em.event_id = p_event_id
     and em.user_id = p_user_id
     and (p_user_id = auth.uid() or public.is_admin());
$$;

-- Revoke default public API access for every SECURITY DEFINER function.
-- Explicitly expose non-trigger helpers only to signed-in users;
-- auth triggers stay callable by the database, not REST API clients.
do $$
declare
  item record;
begin
  for item in
    select format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) as func,
           p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', item.func);
    if not item.is_trigger then
      execute format('grant execute on function %s to authenticated, service_role', item.func);
    end if;
  end loop;
end;
$$;

-- The regular updated_at trigger needs a pinned path to remove
-- untrusted schema/function lookup ambiguity.
alter function public.set_updated_at()
  set search_path = public, pg_catalog;

-- Staging acceptance:
-- 1) No anon EXECUTE on any public SECURITY DEFINER function.
-- 2) Authorized authenticated RLS reads/updates still work.
-- 3) event_role cannot reveal another user's membership.
-- 4) Trigger-based profile creation and updated_at still work.
