-- Staging-first, least-privilege role management.
-- Called ONLY from a verified admin server action holding service_role.
-- SECURITY INVOKER (not bypassing RLS by the function itself).
-- The service role connection is already privileged and never reaches
-- the browser. Explicit REVOKE protects the RPC against direct clients.
create or replace function public.assign_app_role(
  p_actor uuid, p_target uuid, p_new_role text
) returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $fn$
declare
  v_actor_role text;
  v_previous_role text;
  v_intake_id uuid;
  v_membership_role text;
begin
  if p_actor is null or p_target is null
     or p_new_role not in ('reporter','reviewer','admin') then
    raise exception 'Invalid role request' using errcode='22023';
  end if;
  if p_actor = p_target then
    raise exception 'Administrators cannot change their own role' using errcode='42501';
  end if;

  -- A global transactional advisory lock prevents concurrent role changes
  -- from both demoting the last active administrator.
  perform pg_catalog.pg_advisory_xact_lock(293743921);
  select role into v_actor_role from public.profiles where id=p_actor;
  if v_actor_role is distinct from 'admin' then
    raise exception 'Only an active admin can assign roles' using errcode='42501';
  end if;

  select role into v_previous_role from public.profiles
    where id=p_target for update;
  if not found then
    raise exception 'Target account does not exist' using errcode='P0002';
  end if;
  if v_previous_role = p_new_role then
    return pg_catalog.jsonb_build_object('ok',true,'changed',false);
  end if;
  if v_previous_role = 'admin' and p_new_role <> 'admin' and
    (select count(*) from public.profiles where role='admin') <= 1 then
    raise exception 'Cannot remove the last administrator' using errcode='42501';
  end if;

  update public.profiles set role=p_new_role,updated_at=now()
  where id=p_target;

  -- Global demotion must also remove event-level elevated rights.
  if p_new_role='reporter' then
    update public.event_members set role='contributor'
    where user_id=p_target and role <> 'contributor';
  elsif p_new_role='reviewer' then
    update public.event_members set role='reviewer'
    where user_id=p_target and role='coordinator';
  end if;

  -- The community queue always has the corresponding event role.
  select id into v_intake_id from public.events
    where slug='community-intake' and status='active';
  if v_intake_id is not null then
    if p_new_role='admin' then
      v_membership_role := 'coordinator';
    elsif p_new_role='reviewer' then
      v_membership_role := 'reviewer';
    else
      v_membership_role := 'contributor';
    end if;
    insert into public.event_members(event_id,user_id,role)
    values(v_intake_id,p_target,v_membership_role)
    on conflict(event_id,user_id) do update
      set role=excluded.role;
  end if;

  insert into public.audit_events(actor_id,action,target_id,target_type,metadata)
  values(p_actor,'status_change',p_target,'profile',
    pg_catalog.jsonb_build_object(
      'old_role',v_previous_role,'new_role',p_new_role,
      'source','admin_role_management'
    ));

  insert into public.notifications(recipient_id,kind,title,body)
  select id,'role_changed','Role change recorded',
    'An administrator updated an application role.' from public.profiles where role='admin';

  return pg_catalog.jsonb_build_object('ok',true,'changed',true,
    'oldRole',v_previous_role,'newRole',p_new_role);
end;
$fn$;

revoke all on function public.assign_app_role(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.assign_app_role(uuid,uuid,text) to service_role;
