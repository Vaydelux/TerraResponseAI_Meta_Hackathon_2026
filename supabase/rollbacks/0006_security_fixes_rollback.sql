-- 0006_security_fixes_rollback.sql
-- Rollback for 0006_security_fixes.sql.
-- Reverses every change in 0006, restoring the original (invalid)
-- policies + privileges so the database matches the pre-0006 state.
--
-- WARNING: this is destructive. It reverts security fixes — only run
-- in a dev/rollback scenario.

-- 17. Drop the normalize_audit_action trigger + function
drop trigger if exists trg_normalize_audit_action on public.audit_events;
drop function if exists public.normalize_audit_action();

-- 16. Revert sync_report_geo to the original (no location_source check)
create or replace function public.sync_report_geo()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geo = extensions.ST_SetSRID(
                extensions.ST_MakePoint(new.longitude, new.latitude),
                4326
              )::extensions.geography(POINT, 4326);
  else
    new.geo = null;
  end if;
  return new;
end;
$$;

-- 15. (No-op — the TO list cleanup was done in the new policies.)

-- 14. Restore the original signed_url_log_insert policy (without the
--     report-visibility check)
drop policy if exists signed_url_log_insert_authenticated on public.evidence_signed_url_log;
create policy signed_url_log_insert_authenticated
  on public.evidence_signed_url_log for insert
  to authenticated
  with check (user_id = auth.uid());

-- 13. Restore handle_new_user to the original (no name cap)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

-- 12. Drop the partial audit index
drop index if exists idx_audit_auth_failed_email;

-- 11. Restore the original nearby_reports + viewport_reports (no
--     retention_state filter, no antimeridian handling).
--     NOTE: this requires PostGIS to be available (the original
--     definitions use extensions.ST_*).
create or replace function public.nearby_reports(
  p_event_id   uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_radius_m   integer default 1000,
  p_limit      integer default 20,
  p_offset     integer default 0
)
returns table (
  id              uuid,
  title           text,
  status          text,
  review_outcome  text,
  location_source text,
  latitude        double precision,
  longitude       double precision,
  priority_score  integer,
  incident_type   text,
  distance_meters double precision,
  created_at      timestamptz
)
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  if p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid latitude: must be between -90 and 90';
  end if;
  if p_lon is null or p_lon < -180 or p_lon > 180 then
    raise exception 'Invalid longitude: must be between -180 and 180';
  end if;
  if p_radius_m is null or p_radius_m <= 0 or p_radius_m > 50000 then
    raise exception 'Invalid radius: must be between 1 and 50000 meters';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 100 then
    p_limit := 20;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  if not public.is_event_member(p_event_id) then
    raise exception 'You are not a member of this event';
  end if;

  return query
  select
    r.id,
    r.title,
    r.status,
    r.review_outcome,
    r.location_source,
    r.latitude,
    r.longitude,
    r.priority_score,
    (r.report_analyses -> 0 -> 'structured_observation' ->> 'incident_type')::text as incident_type,
    extensions.ST_Distance(
      r.geo,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography(POINT, 4326)
    )::double precision as distance_meters,
    r.created_at
  from public.reports r
  left join lateral (
    select json_agg(ra.structured_observation) as report_analyses
    from public.report_analyses ra
    where ra.report_id = r.id
  ) ra_agg on true
  where r.event_id = p_event_id
    and r.geo is not null
    and extensions.ST_DWithin(
      r.geo,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography(POINT, 4326),
      p_radius_m
    )
  order by distance_meters asc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.viewport_reports(
  p_event_id  uuid,
  p_sw_lat    double precision,
  p_sw_lon    double precision,
  p_ne_lat    double precision,
  p_ne_lon    double precision,
  p_limit     integer default 200
)
returns table (
  id              uuid,
  title           text,
  status          text,
  review_outcome  text,
  location_source text,
  latitude        double precision,
  longitude       double precision,
  priority_score  integer,
  incident_type   text,
  created_at      timestamptz
)
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  if p_sw_lat is null or p_sw_lat < -90 or p_sw_lat > 90 then
    raise exception 'Invalid southwest latitude';
  end if;
  if p_ne_lat is null or p_ne_lat < -90 or p_ne_lat > 90 then
    raise exception 'Invalid northeast latitude';
  end if;
  if p_sw_lat >= p_ne_lat then
    raise exception 'Southwest latitude must be less than northeast latitude';
  end if;
  if p_sw_lon is null or p_sw_lon < -180 or p_sw_lon > 180 then
    raise exception 'Invalid southwest longitude';
  end if;
  if p_ne_lon is null or p_ne_lon < -180 or p_ne_lon > 180 then
    raise exception 'Invalid northeast longitude';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 500 then
    p_limit := 200;
  end if;

  if not public.is_event_member(p_event_id) then
    raise exception 'You are not a member of this event';
  end if;

  return query
  select
    r.id,
    r.title,
    r.status,
    r.review_outcome,
    r.location_source,
    r.latitude,
    r.longitude,
    r.priority_score,
    (ra_agg.report_analyses -> 0 -> 'structured_observation' ->> 'incident_type')::text as incident_type,
    r.created_at
  from public.reports r
  left join lateral (
    select json_agg(ra.structured_observation) as report_analyses
    from public.report_analyses ra
    where ra.report_id = r.id
  ) ra_agg on true
  where r.event_id = p_event_id
    and r.geo is not null
    and extensions.ST_Intersects(
      r.geo,
      extensions.ST_MakeEnvelope(p_sw_lon, p_sw_lat, p_ne_lon, p_ne_lat, 4326)
        ::extensions.geography
    )
  order by r.created_at desc
  limit p_limit;
end;
$$;

-- 10. Drop the event_members self-demotion trigger + function
drop trigger if exists trg_guard_event_member_self_demotion on public.event_members;
drop function if exists public.guard_event_member_self_demotion();

-- 9. Restore the original ai_usage_log SELECT policy (with report_id
--    is null branch)
drop policy if exists ai_usage_log_select_via_report on public.ai_usage_log;
create policy ai_usage_log_select_via_report
  on public.ai_usage_log for select
  to authenticated
  using (
    report_id is null
    or exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
    or public.is_admin()
  );

-- 8. Restore the original priority_overrides SELECT policy (no reviewer)
drop policy if exists priority_overrides_select on public.priority_overrides;
create policy priority_overrides_select
  on public.priority_overrides for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_coordinator_or_admin(r.event_id)
        or public.is_admin()
      )
    )
  );

-- 7. Restore the original report_retention INSERT policy (no
--    retention_state constraint)
drop policy if exists report_retention_insert_via_report on public.report_retention;
create policy report_retention_insert_via_report
  on public.report_retention for insert
  to authenticated, service_role
  with check (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );

-- 6. Drop the retention transition trigger + function, restore the
--    original (invalid) update policy
drop trigger if exists trg_guard_retention_transition on public.report_retention;
drop function if exists public.guard_retention_transition();

drop policy if exists report_retention_update_via_report on public.report_retention;
create policy report_retention_update_via_report
  on public.report_retention for update
  to authenticated, service_role
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  )
  with check (
    (new.retention_state = 'purged' and public.is_admin())
    or (new.retention_state in ('active', 'soft_deleted') and exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    ))
  );

-- 5. Drop the profile role guard trigger + function, restore the
--    original (invalid) profile policies
drop trigger if exists trg_guard_profile_role on public.profiles;
drop function if exists public.guard_profile_role();

drop policy if exists profiles_update_self_no_role_change on public.profiles;
create policy profiles_update_self_no_role_change
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and new.role = old.role);

-- 4. Restore the original (invalid) reports UPDATE policies + the
--    full-table UPDATE grant
revoke update on public.reports from authenticated;
grant update on public.reports to authenticated;

drop policy if exists reports_update_event_reviewer_or_admin on public.reports;
create policy reports_update_event_reviewer_or_admin
  on public.reports for update
  to authenticated
  using (public.is_event_reviewer_or_higher(event_id))
  with check (
    public.is_event_reviewer_or_higher(event_id)
    and new.event_id = old.event_id
    and new.creator_id = old.creator_id
    and new.sha256 = old.sha256
    and new.original_storage_key = old.original_storage_key
    and new.derivative_storage_key is not distinct from old.derivative_storage_key
    and new.thumbnail_storage_key is not distinct from old.thumbnail_storage_key
    and new.image_mime_type = old.image_mime_type
    and new.image_bytes = old.image_bytes
    and new.image_width is not distinct from old.image_width
    and new.image_height is not distinct from old.image_height
    and new.captured_at is not distinct from old.captured_at
    and new.uploaded_at = old.uploaded_at
  );

drop policy if exists reports_update_creator_pre_review on public.reports;
create policy reports_update_creator_pre_review
  on public.reports for update
  to authenticated
  using (
    creator_id = auth.uid()
    and status in ('uploaded','analyzing')
  )
  with check (
    creator_id = auth.uid()
    and old.status in ('uploaded','analyzing')
    and new.status not in ('reviewed')
    and new.review_outcome is null
  );

-- 3. Restore the original profiles INSERT policy (no role constraint)
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- 2. (No function change — just the comment is restored to the original.)
comment on function public.write_audit_event(
  text, uuid, text, jsonb, inet, text
) is null;

-- 1. Restore the original (lowercase-only) CHECK constraint
alter table public.audit_events
  drop constraint if exists audit_events_action_check;
alter table public.audit_events
  add constraint audit_events_action_check
  check (action in (
    'login','logout','auth_failed','upload','analyze',
    'review','delete','status_change','permission_denied',
    'register','priority_override'
  ));

-- ============================================================================
-- End of 0006_security_fixes_rollback.sql
-- ============================================================================
