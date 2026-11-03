-- Forward-only follow-up to the already-applied 0012 permissions migration.
-- Apply on isolated staging first, after reviewing the live function set.
-- Do not edit or replay 0012: both connected projects have recorded it.

-- SECURITY DEFINER policy/storage helpers are SQL dependencies, not public
-- REST RPCs. They still require authenticated EXECUTE because PostgreSQL
-- checks function privileges while evaluating RLS and storage policies.
-- Revoke anonymous/public exposure everywhere, and remove authenticated
-- EXECUTE only from functions that are not policy dependencies or explicit
-- application RPCs.
do $$
declare
  item record;
begin
  for item in
    select format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) as func
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', item.func);
    if item.func !~ '^(public\.(event_role|is_admin|is_event_contributor_or_higher|is_event_coordinator_or_admin|is_event_member|is_event_reviewer_or_higher|storage_event_contributor_or_higher|storage_event_member|storage_event_reviewer_or_higher|submit_review_atomic|write_audit_event)\()' then
      execute format('revoke all on function %s from authenticated', item.func);
    end if;
  end loop;
end;
$$;

-- RLS/storage dependencies and caller-facing RPCs must remain executable by
-- authenticated sessions. Their bodies still enforce auth.uid(), role,
-- event, report and idempotency checks.
grant execute on function public.event_role(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_event_contributor_or_higher(uuid) to authenticated, service_role;
grant execute on function public.is_event_coordinator_or_admin(uuid) to authenticated, service_role;
grant execute on function public.is_event_member(uuid) to authenticated, service_role;
grant execute on function public.is_event_reviewer_or_higher(uuid) to authenticated, service_role;
grant execute on function public.storage_event_contributor_or_higher(text) to authenticated, service_role;
grant execute on function public.storage_event_member(text) to authenticated, service_role;
grant execute on function public.storage_event_reviewer_or_higher(text) to authenticated, service_role;
grant execute on function public.submit_review_atomic(
  uuid, uuid, text, text, text, jsonb
) to authenticated, service_role;

grant execute on function public.write_audit_event(
  text, uuid, text, jsonb, inet, text
) to authenticated, service_role;

-- Staging acceptance must confirm no anon EXECUTE, preserved authenticated
-- execution for RLS/storage dependencies, and no authenticated execution for
-- trigger-only or other non-policy SECURITY DEFINER functions.
