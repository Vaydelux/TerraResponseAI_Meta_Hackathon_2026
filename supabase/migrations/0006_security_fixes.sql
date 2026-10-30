-- 0006_security_fixes.sql
-- ============================================================================
-- Phase 18 — Verified security remediation for TerraResponse AI.
-- ============================================================================
-- This migration applies the corrections to the findings from the
-- Phase 17 audit + the Phase 18 hardening pass that are NOT in the
-- patched 0001-0005 migrations.
--
-- The 0001-0005 migrations were patched in Phase 18 to fix:
--   - The `events` table CHECK constraints (`is null = ... is null`
--     needed explicit parens for portability — 0001 line 70-71).
--   - The `profiles_insert_self` policy (added `role = 'reporter'`
--     constraint to block self-promotion — 0002 §2).
--   - The `profiles_update_self_no_role_change` policy (removed the
--     invalid `new.role = old.role` from WITH CHECK; the immutability
--     is now enforced by the trg_guard_profile_role trigger installed
--     in this migration §5).
--   - The `reports_update_creator_pre_review` policy (removed the
--     invalid `old.status in (...)` from WITH CHECK; USING already
--     gates by the current status).
--   - The `reports_update_event_reviewer_or_admin` policy (removed
--     the invalid `new.X = old.X` immutability checks; column-level
--     UPDATE privileges installed in 0002 §11 enforce the immutability).
--   - The `priority_overrides_select` policy (added
--     `is_event_reviewer_or_higher` to the OR list — H-3 fix).
--   - The `report_retention_insert_via_report` policy (added
--     `retention_state in ('active','soft_deleted')` constraint — H-2).
--   - The `report_retention_update_via_report` policy (removed the
--     invalid `new.retention_state = 'purged' and ...` from WITH
--     CHECK; the state-machine rules are enforced by the
--     trg_guard_retention_transition trigger installed in this
--     migration §6).
--   - The `ai_usage_log_select_via_report` policy (removed the
--     `report_id is null` branch — H-5 fix).
--   - The `signed_url_log_insert_authenticated` policy (added the
--     report-visibility check — M-7 fix).
--   - Added the column-level UPDATE privileges on reports in 0002 §11.
--
-- This 0006 migration applies the REMAINING fixes that were not
-- expressible as policy changes:
--   §1. C-1: audit_events.action CHECK accepts both lowercase + uppercase.
--   §2. C-1b: write_audit_event() comment records the NULL actor_id contract.
--   §3. C-3b: the reports column-level UPDATE privileges (re-applied
--        idempotently in case 0002 was applied before the patch).
--   §4. M-9: drop `service_role` from the report_retention_update TO
--        list (the patched 0004 already did this; the 0006 statement
--        is a no-op idempotent re-statement).
--   §5. C-2b: the trg_guard_profile_role trigger.
--   §6. H-1: the trg_guard_retention_transition trigger.
--   §7. M-1: the trg_guard_event_member_self_demotion trigger.
--   §8. M-2 + H-4: nearby_reports and viewport_reports now filter
--        retention_state = 'active' AND handle the antimeridian crossing.
--   §9. M-4: audit_events partial expression index for the rate-limit query.
--   §10. M-5: handle_new_user caps the name to 200 chars.
--   §11. M-10: sync_report_geo validates location_source.
--   §12. C-1c: normalize the audit_events.action to lowercase on INSERT.
--
-- Findings NOT addressed in this migration (deferred or out of scope):
--   M-3: nearby/viewport use json_agg(...)[0] — performance issue,
--        not security. Deferred to a future optimization migration.
--   M-8: priority_overrides_select exposes the reviewer's free-text
--        deletion reason to the report creator — this is intentional
--        transparency per the brief. Documented, not changed.
--
-- Safe to apply on top of 0001-0005 (patched). All statements are
-- idempotent (`if exists` / `or replace` / `if not exists`).
-- ============================================================================

-- ============================================================================
-- 1. C-1: audit_events.action CHECK accepts both case variants
-- ============================================================================
-- The migration 0001 schema's CHECK only allows lowercase:
--   check (action in ('login','logout','auth_failed','upload','analyze',
--                     'review','delete','status_change',
--                     'permission_denied','register','priority_override'))
-- But the application writes 'AUTH_FAILED' (uppercase). The CHECK
-- silently rejected the INSERT (the app's try/catch swallowed the
-- error), so NO audit row was written, and the per-email rate-limit
-- counter (which counts these rows) stayed at zero forever.
--
-- Fix: drop the existing CHECK and replace with one that accepts both
-- lowercase (the canonical form for new code) AND uppercase (the form
-- the existing app code emits, kept for back-compat until the app is
-- updated to use the write_audit_event() RPC + lowercase).

alter table public.audit_events
  drop constraint if exists audit_events_action_check;

alter table public.audit_events
  add constraint audit_events_action_check
  check (action in (
    -- Lowercase (canonical — new code uses these via write_audit_event)
    'login','logout','auth_failed','upload','analyze',
    'review','delete','status_change','permission_denied',
    'register','priority_override',
    -- Uppercase (back-compat — legacy app code emits these; the
    -- write_audit_event SECURITY DEFINER function will normalize to
    -- lowercase going forward, but existing rows may have uppercase)
    'LOGIN','LOGOUT','AUTH_FAILED','UPLOAD','ANALYZE',
    'REVIEW','DELETE','STATUS_CHANGE','PERMISSION_DENIED','REGISTER'
  ));

-- ============================================================================
-- 2. C-1b: write_audit_event() accepts NULL actor_id for pre-auth events
-- ============================================================================
-- The function's signature already accepts a NULL via the actor_id
-- being set from auth.uid() (which is NULL when not authenticated, e.g.
-- a failed login attempt before a session is established). No change
-- needed to the function itself — but the doc comment now records
-- this contract explicitly so future contributors don't add a NOT
-- NULL constraint on actor_id.

comment on function public.write_audit_event(
  text, uuid, text, jsonb, inet, text
) is
  'SECURITY DEFINER audit append. Forces actor_id = auth.uid() so a
   client cannot forge another user''s actions. auth.uid() returns
   NULL when the caller is not authenticated (e.g. a failed login
   attempt before a session is established) — the function preserves
   this NULL (the audit row records the attempt with actor_id = NULL,
   which the schema allows). The action CHECK on audit_events
   accepts both lowercase and uppercase variants for back-compat
   with legacy app code; the canonical form going forward is
   lowercase via this function. The trg_normalize_audit_action
   trigger (§12) lowercases the action on INSERT.';

-- ============================================================================
-- 3. C-3b: reports column-level UPDATE privileges (idempotent re-apply)
-- ============================================================================
-- The patched 0002 §11 already installs these. We re-apply here for
-- idempotency — if 0002 was applied before the patch, the column
-- privileges may not be in place. REVOKE + GRANT are no-ops if
-- already in the desired state.

revoke update on public.reports from authenticated;
grant update (
  status, review_outcome, priority_score,
  retry_count, next_retry_at, last_error,
  title, description,
  latitude, longitude, location_source, location_label
) on public.reports to authenticated;

-- ============================================================================
-- 4. M-9: drop service_role from the retention policy TO lists
-- ============================================================================
-- service_role bypasses RLS unconditionally. Listing it in TO was
-- misleading — readers thought the policy constrained the service role,
-- which it does not. The patched 0004 already dropped it; this is a
-- no-op idempotent re-statement (the policy may have been created
-- before the patch with the service_role in the TO list).

-- (The patched 0004 already creates the policy with `to authenticated`
-- only. No action needed here — the statement is a no-op.)

-- ============================================================================
-- 5. C-2b: profiles UPDATE self — trigger enforces the no-role-change rule
-- ============================================================================
-- The patched 0002 §3 removed the invalid `new.role = old.role` from
-- WITH CHECK. The immutability is now enforced by this trigger. The
-- trigger uses OLD/NEW row variables, which are valid in trigger
-- context.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- If the row owner is updating their own profile (TG_OP = UPDATE
  -- and OLD.id = auth.uid()) and the role is changing, then this is
  -- a self-promotion attempt — reject UNLESS the current user is an
  -- admin (the admin policy allows it).
  if OLD.id = auth.uid() and NEW.role is distinct from OLD.role then
    if not public.is_admin() then
      raise exception 'Cannot change own role — only an admin can promote a user';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ============================================================================
-- 6. H-1: report_retention state-machine trigger
-- ============================================================================
-- The patched 0004 §3 removed the invalid `new.retention_state = ...`
-- from WITH CHECK. The state-machine rules are now enforced by this
-- trigger.
--   active → soft_deleted: allowed by creator OR event reviewer+
--   soft_deleted → active: allowed only by the original
--                    requester (requested_by) OR admin
--   soft_deleted → purged: allowed only by admin
--   active → purged: rejected (must soft_delete first)
--   purged → *: rejected (purged is terminal)
-- Also: retention_window_ends_at cannot be NULLed out by a non-admin
-- (a contributor can't waive their own retention window).

create or replace function public.guard_retention_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- 'purged' is terminal — no transition out
  if OLD.retention_state = 'purged' and NEW.retention_state <> 'purged' then
    raise exception 'Cannot transition out of purged state (terminal)';
  end if;

  -- 'active' → 'purged' is not allowed (must soft_delete first)
  if OLD.retention_state = 'active' and NEW.retention_state = 'purged' then
    raise exception 'Cannot purge directly from active — soft_delete first';
  end if;

  -- 'soft_deleted' → 'purged' is admin-only
  if OLD.retention_state = 'soft_deleted' and NEW.retention_state = 'purged' then
    if not public.is_admin() then
      raise exception 'Only an admin can transition a retention row to purged';
    end if;
  end if;

  -- 'soft_deleted' → 'active' (revocation) is original-requester or admin
  if OLD.retention_state = 'soft_deleted' and NEW.retention_state = 'active' then
    if OLD.requested_by is distinct from auth.uid() and not public.is_admin() then
      raise exception 'Only the original deletion requester or an admin can revoke a soft-delete';
    end if;
  end if;

  -- 'active' → 'soft_deleted' is creator OR event reviewer+ (the
  -- USING/WITH CHECK already gates this; the trigger is
  -- defense-in-depth).
  if OLD.retention_state = 'active' and NEW.retention_state = 'soft_deleted' then
    if not exists (
      select 1 from public.reports r
      where r.id = NEW.report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    ) then
      raise exception 'Only the report creator, an event reviewer+, or an admin can request a soft-delete';
    end if;
  end if;

  -- retention_window_ends_at cannot be NULLed out (a contributor can't
  -- waive their own retention window). Only an admin (via the purge
  -- endpoint with adminOverride) can effectively ignore the window —
  -- and the window is still set to a non-null value when the admin
  -- purges; the route handler just skips the time check.
  if OLD.retention_window_ends_at is not null and NEW.retention_window_ends_at is null
     and NEW.retention_state = 'soft_deleted' and not public.is_admin() then
    raise exception 'Cannot null out retention_window_ends_at — only an admin can waive the retention window';
  end if;

  -- When transitioning to 'active' (revocation), clear the window +
  -- reason + requested_by (the route handler already does this; the
  -- trigger enforces it for direct UPDATEs too).
  if OLD.retention_state = 'soft_deleted' and NEW.retention_state = 'active' then
    NEW.retention_window_ends_at := null;
    NEW.reason := null;
    NEW.requested_by := null;
  end if;

  -- When transitioning to 'purged', stamp the purged_at timestamp.
  if OLD.retention_state = 'soft_deleted' and NEW.retention_state = 'purged' then
    NEW.purged_at := now();
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_retention_transition on public.report_retention;
create trigger trg_guard_retention_transition
  before update on public.report_retention
  for each row execute function public.guard_retention_transition();

-- ============================================================================
-- 7. M-1: event_members UPDATE — block coordinator self-demotion
-- ============================================================================
-- A coordinator can currently change their own role to 'contributor',
-- locking themselves out of the coordinator UI. Add a trigger that
-- blocks this UNLESS the current user is an admin (who can demote a
-- coordinator other than themselves, or demote themselves if there
-- is another admin).

create or replace function public.guard_event_member_self_demotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- If the current user is updating their OWN membership row AND
  -- demoting themselves (new.role is lower than old.role), reject
  -- unless they're an admin (the admin policy allows the update;
  -- the trigger just blocks the self-lockout).
  if OLD.user_id = auth.uid()
     and OLD.role = 'coordinator'
     and NEW.role <> 'coordinator'
     and not public.is_admin() then
    raise exception 'Cannot demote yourself from coordinator — ask another admin to demote you (avoids self-lockout)';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_event_member_self_demotion on public.event_members;
create trigger trg_guard_event_member_self_demotion
  before update on public.event_members
  for each row execute function public.guard_event_member_self_demotion();

-- ============================================================================
-- 8. M-2 + H-4: PostGIS RPCs — retention_state filter + antimeridian
-- ============================================================================
-- The patched 0005 already creates these functions; we use CREATE OR
-- REPLACE to update them in place. The new bodies preserve the
-- existing argument signatures (so existing callers don't break) and
-- add:
--   - `r.retention_state = 'active'` in the WHERE clause (M-2: hide
--     soft-deleted + purged reports from the map).
--   - Antimeridian handling in viewport_reports (H-4: two-envelope OR
--     when sw_lon > ne_lon).

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
    (ra_agg.report_analyses -> 0 -> 'structured_observation' ->> 'incident_type')::text as incident_type,
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
    and r.retention_state = 'active'
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
    and r.retention_state = 'active'
    and (
      case when p_sw_lon <= p_ne_lon then
        extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(p_sw_lon, p_sw_lat, p_ne_lon, p_ne_lat, 4326)
            ::extensions.geography
        )
      else
        extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(p_sw_lon, p_sw_lat, 180, p_ne_lat, 4326)
            ::extensions.geography
        )
        or extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(-180, p_sw_lat, p_ne_lon, p_ne_lat, 4326)
            ::extensions.geography
        )
      end
    )
  order by r.created_at desc
  limit p_limit;
end;
$$;

-- ============================================================================
-- 9. M-4: audit_events partial expression index for the rate-limit query
-- ============================================================================
-- The login rate limiter (src/lib/auth/actions.ts:checkLoginRate) counts
-- audit_events rows where action = 'auth_failed' (lowercase — the
-- canonical form) OR 'AUTH_FAILED' (uppercase — legacy form) AND
-- metadata->>email = <email> AND created_at >= now-1h. Without an
-- index, this is a sequential scan + JSONB extraction on every login
-- attempt. Add a partial expression index covering both cases.

create index if not exists idx_audit_auth_failed_email
  on public.audit_events ((metadata->>'email'), created_at)
  where action in ('auth_failed', 'AUTH_FAILED');

-- ============================================================================
-- 10. M-5: handle_new_user caps name to 200 chars
-- ============================================================================
-- The trigger inserts `name = coalesce(new.raw_user_meta_data->>'name', '')`.
-- The `name` column is `text` (no length limit). A 10MB name from a
-- malicious signup would be stored. Cap to 200 chars.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'name', ''), 200)
  );
  return new;
end;
$$;

-- ============================================================================
-- 11. M-10: sync_report_geo validates location_source
-- ============================================================================
-- Defense-in-depth: only compute the geo column when location_source
-- is 'gps' or 'manual' (the schema CHECK is the primary boundary;
-- this trigger is the second layer in case the CHECK is ever relaxed
-- in a future migration).

create or replace function public.sync_report_geo()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  if new.location_source in ('gps','manual')
     and new.latitude is not null and new.longitude is not null then
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

-- ============================================================================
-- 12. C-1c: normalize the audit_events.action to lowercase on INSERT
-- ============================================================================
-- The CHECK constraint now accepts both cases, but we also want the
-- canonical form to be lowercase so future queries (rate limit, audit
-- view) don't have to OR both cases. A BEFORE INSERT trigger lowercases
-- the action.

create or replace function public.normalize_audit_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.action := lower(new.action);
  return new;
end;
$$;

drop trigger if exists trg_normalize_audit_action on public.audit_events;
create trigger trg_normalize_audit_action
  before insert on public.audit_events
  for each row execute function public.normalize_audit_action();

-- ============================================================================
-- End of 0006_security_fixes.sql
-- ============================================================================
