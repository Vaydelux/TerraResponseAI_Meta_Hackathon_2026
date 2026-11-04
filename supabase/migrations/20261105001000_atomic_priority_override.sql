-- TerraResponse AI: coordinator/admin priority overrides must be atomic and idempotent.
-- No rows are modified when this migration is installed. Existing overrides remain intact.
alter table public.priority_overrides
  add column if not exists request_id uuid;
create unique index if not exists priority_overrides_request_id_unique
  on public.priority_overrides(request_id) where request_id is not null;

create or replace function public.submit_priority_override_atomic(
  p_report_id uuid,
  p_request_id uuid,
  p_new_score integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_report public.reports%rowtype;
  v_existing public.priority_overrides%rowtype;
  v_override_id uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_report_id is null or p_request_id is null then
    raise exception 'Report and request id required' using errcode = '22023';
  end if;
  if p_new_score is null or p_new_score < 0 or p_new_score > 100 then
    raise exception 'Score must be an integer 0 to 100' using errcode = '22023';
  end if;
  if pg_catalog.length(v_reason) < 3 or pg_catalog.length(v_reason) > 2000 then
    raise exception 'A reason of 3 to 2000 characters is required' using errcode = '22023';
  end if;

  -- Lock the report so another reviewer cannot alter the queue score
  -- between the history insert and the priority update.
  select * into v_report from public.reports r
    where r.id = p_report_id for update;
  if not found then
    raise exception 'Report unavailable' using errcode = 'P0002';
  end if;

  if not public.is_admin() and
    not public.is_event_coordinator_or_admin(v_report.event_id) then
    raise exception 'Coordinator/admin role required for this event'
      using errcode = '42501';
  end if;
  if v_report.retention_state <> 'active' then
    raise exception 'Report is no longer active' using errcode = 'P0001';
  end if;

  select * into v_existing
    from public.priority_overrides o
    where o.request_id = p_request_id limit 1;
  if found then
    if v_existing.report_id <> p_report_id or
      v_existing.overridden_by <> v_actor or
      v_existing.new_score <> p_new_score or
      v_existing.reason <> v_reason then
      raise exception 'Request ID was already used for another override'
        using errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', true, 'reportId', p_report_id,
      'computedScore', v_existing.previous_score, 'overriddenScore', v_existing.new_score,
      'overriddenBy', v_actor, 'overrideId', v_existing.id);
  end if;

  insert into public.priority_overrides (
    request_id, report_id, overridden_by, previous_score, new_score, reason
  ) values (
    p_request_id, p_report_id, v_actor, v_report.priority_score, p_new_score, v_reason
  ) returning id into v_override_id;

  update public.reports r
    set priority_score = p_new_score where r.id = p_report_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'idempotent', false, 'reportId', p_report_id,
    'computedScore', v_report.priority_score, 'overriddenScore', p_new_score,
    'overriddenBy', v_actor, 'overrideId', v_override_id);
end;
$function$;

revoke all on function public.submit_priority_override_atomic(
  uuid, uuid, integer, text
) from public, anon;
grant execute on function public.submit_priority_override_atomic(
  uuid, uuid, integer, text
) to authenticated;
