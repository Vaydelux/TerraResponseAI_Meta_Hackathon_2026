-- TerraResponse AI: review decisions must be a single atomic transaction.
-- This forward-only migration deliberately requires staging verification before deployment.
-- A SECURITY DEFINER RPC is necessary because reviewer RLS forbids direct
-- UPDATE of report_analyses; all authorization is re-checked inside the function.

alter table public.review_actions
  add column if not exists request_id uuid;

create unique index if not exists review_actions_request_id_unique
  on public.review_actions(request_id) where request_id is not null;

create or replace function public.submit_review_atomic(
  p_report_id uuid,
  p_request_id uuid,
  p_action text,
  p_comment text default null,
  p_reason text default null,
  p_corrections jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_report public.reports%rowtype;
  v_analysis public.report_analyses%rowtype;
  v_existing public.review_actions%rowtype;
  v_key text;
  v_arr jsonb;
  v_item jsonb;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_outcome text;
  v_has_corrections boolean;
  v_severity integer;
  v_original jsonb;
  v_review_id uuid;
  v_reviewed_at timestamptz := pg_catalog.now();
begin
  -- Never trust a route handler's asserted identity or permissions.
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role in ('reviewer', 'admin')
  ) then
    raise exception 'Reviewer role required' using errcode = '42501';
  end if;

  if p_report_id is null or p_request_id is null then
    raise exception 'Report and request IDs are required' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('confirm', 'flag', 'reject', 'resolve', 'request_info', 'correct', 'comment') then
    raise exception 'Invalid review action' using errcode = '22023';
  end if;
  if p_corrections is null or pg_catalog.jsonb_typeof(p_corrections) <> 'object' then
    raise exception 'Corrections must be an object' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_comment, '')) > 5000 or
     pg_catalog.length(coalesce(p_reason, '')) > 2000 then
    raise exception 'Review comment or reason too long' using errcode = '22023';
  end if;
  if p_action = 'reject' and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Rejecting a report requires a reason' using errcode = '22023';
  end if;

  -- Row lock serializes concurrent review attempts for the same report.
  select * into v_report
    from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'Report unavailable' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.is_event_reviewer_or_higher(v_report.event_id)) then
    raise exception 'Event reviewer access required' using errcode = '42501';
  end if;
  if v_report.creator_id = v_actor and not public.is_admin() then
    raise exception 'Self-review is not permitted' using errcode = '42501';
  end if;
  if v_report.retention_state <> 'active' then
    raise exception 'Evidence is no longer available for review' using errcode = 'P0001';
  end if;

  -- The same idempotency key may be retried after a dropped HTTP response.
  -- It never creates a second history row or changes the report twice.
  select * into v_existing from public.review_actions a
    where a.request_id = p_request_id limit 1;
  if found then
    if v_existing.report_id <> p_report_id or v_existing.reviewer_id <> v_actor then
      raise exception 'Request ID already used' using errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', true, 'reportId', p_report_id,
      'action', p_action, 'newStatus', v_existing.new_status,
      'reviewOutcome', v_report.review_outcome,
      'reviewerId', v_actor, 'reviewedAt', v_existing.created_at,
      'correctionsApplied', v_existing.new_observation is not null
    );
  end if;

  if v_report.status not in ('needs_review', 'needs_manual_review', 'reviewed') then
    raise exception 'Report is not reviewable' using errcode = 'P0001';
  end if;

  v_has_corrections := p_corrections <> '{}'::jsonb;
  if p_action in ('correct', 'comment') and not v_has_corrections then
    raise exception 'A correction must include changed fields' using errcode = '22023';
  end if;
  if (p_action not in ('correct', 'comment')) and v_has_corrections then
    raise exception 'Corrections require the correct action' using errcode = '22023';
  end if;
  if v_has_corrections and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required for corrections' using errcode = '22023';
  end if;

  for v_key in select pg_catalog.jsonb_object_keys(p_corrections) loop
    if v_key not in (
      'incident_type', 'preliminary_severity', 'summary_en',
      'summary_tl', 'uncertainties', 'visible_evidence'
    ) then
      raise exception 'Correction field is not allowed' using errcode = '22023';
    end if;
  end loop;

  if p_corrections ? 'incident_type' then
    if (p_corrections ->> 'incident_type') not in
      ('flooding','blocked_road','debris','visible_structural_damage','other','unclear') then
      raise exception 'Invalid incident classification' using errcode = '22023';
    end if;
  end if;
  if p_corrections ? 'preliminary_severity' and
    pg_catalog.jsonb_typeof(p_corrections -> 'preliminary_severity') <> 'null' then
    if pg_catalog.jsonb_typeof(p_corrections -> 'preliminary_severity') <> 'number' or
       (p_corrections ->> 'preliminary_severity') !~ '^[1-5]$' then
      raise exception 'Severity must be an integer 1 to 5 or null' using errcode = '22023';
    end if;
  end if;
  if p_corrections ? 'summary_en' then
    if pg_catalog.jsonb_typeof(p_corrections -> 'summary_en') <> 'string' or
      pg_catalog.length(p_corrections ->> 'summary_en') > 1000 then
      raise exception 'Invalid English summary' using errcode = '22023';
    end if;
  end if;
  if p_corrections ? 'summary_tl' then
    if pg_catalog.jsonb_typeof(p_corrections -> 'summary_tl') <> 'string' or
      pg_catalog.length(p_corrections ->> 'summary_tl') > 1000 then
      raise exception 'Invalid Tagalog summary' using errcode = '22023';
    end if;
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_corrections) loop
    if v_key in ('uncertainties', 'visible_evidence') then
      v_arr := p_corrections -> v_key;
      if pg_catalog.jsonb_typeof(v_arr) <> 'array' then
        raise exception 'Correction list must be an array' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(v_arr) >
        case when v_key = 'uncertainties' then 10 else 20 end then
        raise exception 'Correction list exceeds limit' using errcode = '22023';
      end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_arr) as elem(value) loop
        if pg_catalog.jsonb_typeof(v_item) <> 'string' or
          pg_catalog.length(v_item #>> '{}') >
            case when v_key = 'uncertainties' then 300 else 500 end then
          raise exception 'Invalid correction list item' using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;

  select * into v_analysis from public.report_analyses a
    where a.report_id = p_report_id for update;
  if v_has_corrections and not found then
    raise exception 'No analysis exists to correct' using errcode = 'P0001';
  end if;
  v_before := coalesce(v_analysis.structured_observation, '{}'::jsonb);
  v_after := null;
  v_severity := null;

  if v_has_corrections then
    v_original := coalesce(
      v_before -> '_original_model_output', v_before
    );
    v_after := v_before || p_corrections ||
      pg_catalog.jsonb_build_object(
        '_original_model_output', v_original,
        '_corrected_by', v_actor,
        '_corrected_at', v_reviewed_at,
        '_correction_reason', p_reason
      );
    if p_corrections ? 'preliminary_severity' then
      if pg_catalog.jsonb_typeof(p_corrections -> 'preliminary_severity') <> 'null' then
        v_severity := (p_corrections ->> 'preliminary_severity')::integer * 20;
      end if;
    else
      v_severity := v_analysis.severity_score;
    end if;
  end if;

  v_action := case when p_action in ('correct','comment') then 'comment'
                   when p_action = 'request_info' then 'flag'
                   else p_action end;
  v_outcome := case when p_action in ('correct','comment','confirm') then 'confirmed'
                    when p_action in ('flag','request_info') then 'flagged'
                    when p_action = 'reject' then 'rejected'
                    else 'resolved' end;

  -- These writes occur in ONE Postgres function call/transaction.
  -- Any failed statement aborts all preceding mutations.
  if v_has_corrections then
    update public.report_analyses a
      set structured_observation = v_after, severity_score = v_severity
      where a.report_id = p_report_id;
  end if;

  insert into public.review_actions (
    request_id, report_id, reviewer_id, action, comment,
    previous_status, new_status,
    previous_observation, new_observation, previous_severity, new_severity
  ) values (
    p_request_id, p_report_id, v_actor, v_action,
    coalesce(p_comment, p_reason),
    v_report.status, 'reviewed',
    case when v_has_corrections then v_before else null end,
    v_after, v_analysis.severity_score,
    case when v_has_corrections then v_severity else null end
  ) returning id into v_review_id;

  update public.reports r
    set status = 'reviewed', review_outcome = v_outcome
    where r.id = p_report_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'idempotent', false, 'reportId', p_report_id,
    'reviewActionId', v_review_id, 'action', p_action,
    'newStatus', 'reviewed', 'reviewOutcome', v_outcome,
    'correctionsApplied', v_has_corrections,
    'reviewerId', v_actor, 'reviewedAt', v_reviewed_at
  );
end;
$function$;

-- Public functions default to PUBLIC EXECUTE: revoke explicitly.
revoke all on function public.submit_review_atomic(
  uuid, uuid, text, text, text, jsonb
) from public, anon;
grant execute on function public.submit_review_atomic(
  uuid, uuid, text, text, text, jsonb
) to authenticated;
