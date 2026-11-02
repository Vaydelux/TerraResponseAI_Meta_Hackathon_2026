-- Phase 2C: synchronize public alert state after human decisions and
-- prevent duplicate admin notifications during concurrent retries.
-- Staging first; no anonymous read grants and no change to report RLS.

-- Notification IDs are append-only; the same (recipient, report, kind)
-- should never appear twice. Null report IDs remain repeatable for role
-- history and other non-report notifications.
create unique index if not exists notifications_report_kind_once
  on public.notifications(recipient_id,report_id,kind);

create or replace function public.sync_triage_after_human_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $body$
begin
  if new.status <> 'reviewed' or new.review_outcome is null then
    return new;
  end if;

  -- Reports are changed AFTER submit_review_atomic inserts a signed
  -- review_actions history row in the SAME transaction. The existing
  -- publication guard checks that audit trail before public_verified.
  --
  -- Critical provisional sightings are withdrawn from the provisional
  -- feed as soon as a human reviewer decides. Only explicitly
  -- confirmed reports may transition to verified publication.
  update public.report_triage t
  set
    verification_status =
      case when new.review_outcome='confirmed' then 'confirmed'
           when new.review_outcome='rejected' then 'rejected'
           else 'awaiting_human' end,
    publication_status =
      case
        when new.review_outcome='confirmed' and
          t.publication_status='public_provisional' then 'public_verified'
        else 'private'
      end,
    updated_at = pg_catalog.now()
  where t.report_id=new.id;
  return new;
end;
$body$;

drop trigger if exists trg_sync_triage_after_human_review on public.reports;
create trigger trg_sync_triage_after_human_review
  after update of status,review_outcome on public.reports
  for each row
  when (
    new.status='reviewed' and
    (old.status is distinct from new.status or
     old.review_outcome is distinct from new.review_outcome)
  )
  execute function public.sync_triage_after_human_review();

revoke all on function public.sync_triage_after_human_review()
  from public,anon,authenticated;
grant execute on function public.sync_triage_after_human_review()
  to service_role;
