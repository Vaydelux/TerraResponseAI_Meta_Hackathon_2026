-- Phase 2B: security boundary for AI-severity moderation and publication.
-- Staging-first. Never grant new table access or expose evidence via Data API.
-- Additive and idempotent; audit-history preservation and current RLS unchanged.

create or replace function public.enforce_review_severity_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $body$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_severity integer;
  v_class text;
begin
  -- Every human review creates exactly one append-only review_actions row.
  -- This trigger runs INSIDE submit_review_atomic's transaction before
  -- any attempted bypass may commit. The security definer review RPC has
  -- already taken the report row lock, checked RLS-equivalent membership,
  -- and validated the idempotency request ID.
  if v_actor is null or new.reviewer_id is distinct from v_actor then
    raise exception 'Verified reviewer identity required' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_actor;
  if v_role = 'admin' then
    return new;
  end if;
  if v_role is distinct from 'reviewer' then
    raise exception 'Reviewer role required' using errcode = '42501';
  end if;

  select t.preliminary_severity,t.triage_class
    into v_severity,v_class
    from public.report_triage t where t.report_id = new.report_id;

  -- Absence, uncertain classification and high/critical severity are
  -- all ADMIN ONLY. For unrelated evidence a null severity is expected.
  if not found or v_class not in
      ('low_review','moderate_review','unrelated_review') or
      (v_severity is not null and v_severity > 3) or
      (v_severity is null and v_class <> 'unrelated_review') then
    raise exception 'High/critical or uncertain reports require an administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$body$;

drop trigger if exists trg_review_severity_boundary on public.review_actions;
create trigger trg_review_severity_boundary
  before insert on public.review_actions
  for each row execute function public.enforce_review_severity_boundary();

-- No one should be able to call a trigger function as an RPC.
revoke all on function public.enforce_review_severity_boundary()
  from public,anon,authenticated;
grant execute on function public.enforce_review_severity_boundary() to service_role;

create or replace function public.enforce_triage_publication_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $body$
declare
  v_report public.reports%rowtype;
begin
  -- Fail closed for missing evidence. The publication flag alone never
  -- grants anonymous database access or a public evidence URL.
  if new.publication_status = 'private' then return new; end if;

  select * into v_report from public.reports where id = new.report_id;
  if not found then
    raise exception 'Publication requires a valid report' using errcode = '23514';
  end if;

  if new.publication_status = 'public_provisional' then
    if new.triage_class <> 'critical_provisional'
       or new.preliminary_severity is distinct from 5
       or new.verification_status <> 'awaiting_human'
       or new.is_ai_generated is distinct from true
       or pg_catalog.length(pg_catalog.btrim(coalesce(new.model_id,''))) = 0
       or v_report.location_source not in ('gps','manual')
       or v_report.latitude is null or v_report.longitude is null
       or v_report.status not in ('needs_review','reviewed') then
      raise exception 'Only evidence-backed, located, unverified critical findings may be provisional'
        using errcode = '23514';
    end if;
  elsif new.publication_status = 'public_verified' then
    if new.verification_status <> 'confirmed'
      or v_report.status <> 'reviewed'
      or v_report.review_outcome <> 'confirmed'
      or not exists (
        select 1 from public.review_actions ra
        where ra.report_id=new.report_id and ra.action='confirm'
      ) then
      raise exception 'Public verification requires confirmed human review'
        using errcode = '23514';
    end if;
  else
    raise exception 'Unknown publication state' using errcode = '23514';
  end if;
  return new;
end;
$body$;

drop trigger if exists trg_triage_publication_boundary on public.report_triage;
create trigger trg_triage_publication_boundary
  before insert or update of publication_status,verification_status,triage_class,
    preliminary_severity,model_id,is_ai_generated on public.report_triage
  for each row execute function public.enforce_triage_publication_boundary();

revoke all on function public.enforce_triage_publication_boundary()
  from public,anon,authenticated;
grant execute on function public.enforce_triage_publication_boundary() to service_role;
