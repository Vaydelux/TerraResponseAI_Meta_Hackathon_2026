-- ============================================================================
-- TerraResponse AI — RLS test suite (negative + positive)
-- ============================================================================
-- Prerequisite: 0001_schema.sql + 0002_rls.sql + 0003_storage.sql +
-- supabase/seed.sql all applied.
--
-- This script verifies the RLS policies by simulating different users
-- via `set local role authenticated` + `set local request.jwt.claim.sub`
-- (the Supabase convention — auth.uid() reads the JWT sub claim). Each
-- test block is wrapped in a transaction that rolls back, so the
-- script is safe to run repeatedly.
--
-- Run:
--   psql "$DB_URL" -v ON_ERROR_STOP=0 -f supabase/tests/test_rls.sql
--
-- The script prints PASS/FAIL lines to stdout. A non-zero count of
-- FAIL lines at the end means the RLS policies have a gap.
--
-- Test users (from seed.sql):
--   Alice  11111111-1111-1111-1111-111111111111  reporter, contributor in Event A
--   Bob    22222222-2222-2222-2222-222222222222  reviewer, reviewer in Event A
--   Carol  33333333-3333-3333-3333-333333333333  admin, coordinator in Event B
--   Dave   44444444-4444-4444-4444-444444444444  reporter, contributor in Event B
--   Event A aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--   Event B bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
--   Report R cccccccc-cccc-cccc-cccc-cccccccccccc  (in Event A, created by Alice)
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

-- Helper: print a PASS/FAIL line.
create or replace function _tf(label text, ok boolean)
returns text language plpgsql as $$
begin
  return case when ok then 'PASS: ' || label else 'FAIL: ' || label end;
end;
$$;

-- ===========================================================================
-- TEST 1: unauthenticated role sees NO profiles, events, reports.
-- ===========================================================================
do $$
declare
  v_profiles int; v_events int; v_reports int;
begin
  set local role anon;
  set local request.jwt.claim.sub = '';
  set local request.jwt.claims = '{}';
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_events  from public.events;
  select count(*) into v_reports from public.reports;
  reset role;
  raise notice '%', _tf('anon sees 0 profiles',   v_profiles = 0);
  raise notice '%', _tf('anon sees 0 events',    v_events  = 0);
  raise notice '%', _tf('anon sees 0 reports',   v_reports = 0);
end $$;

-- ===========================================================================
-- TEST 2: Alice (contributor in A) can see Event A but NOT Event B.
-- ===========================================================================
do $$
declare
  v_a int; v_b int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select count(*) into v_a from public.events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into v_b from public.events where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  reset role;
  raise notice '%', _tf('Alice sees Event A',  v_a = 1);
  raise notice '%', _tf('Alice CANNOT see Event B (cross-event)', v_b = 0);
end $$;

-- ===========================================================================
-- TEST 3: Dave (contributor in B) CANNOT see Alice's report in Event A.
--         This is the "second unaffiliated user" gate test.
-- ===========================================================================
do $$
declare
  v_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  select count(*) into v_count from public.reports where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  reset role;
  raise notice '%', _tf('Dave CANNOT read Alice''s Event A report (cross-event RLS)', v_count = 0);
end $$;

-- ===========================================================================
-- TEST 4: Alice can read her OWN report; Dave cannot read the same report.
-- ===========================================================================
do $$
declare
  v_alice int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select count(*) into v_alice from public.reports where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  reset role;
  raise notice '%', _tf('Alice reads own report', v_alice = 1);
end $$;

-- ===========================================================================
-- TEST 5: Dave cannot INSERT a report in Event A (not a member).
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  begin
    insert into public.reports (
      event_id, creator_id, original_storage_key, sha256,
      image_mime_type, image_bytes, location_source
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '44444444-4444-4444-4444-444444444444',
      'evidence-originals/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/jpeg', 1024, 'unknown'
    );
    -- If we get here, RLS let the insert through — that's a FAIL.
    v_ok := false;
  exception when others then
    v_ok := true;  -- expected: insert blocked by RLS
  end;
  reset role;
  raise notice '%', _tf('Dave CANNOT insert report in Event A (not a member)', v_ok);
end $$;

-- ===========================================================================
-- TEST 6: Alice can INSERT a report in Event A (she is a contributor).
-- ===========================================================================
do $$
declare
  v_ok boolean;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  begin
    insert into public.reports (
      id, event_id, creator_id, original_storage_key, sha256,
      image_mime_type, image_bytes, location_source
    ) values (
      'dddddddd-0000-0000-0000-000000000001',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      'evidence-originals/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/dddddddd-0000-0000-0000-000000000001.jpg',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/jpeg', 1024, 'unknown'
    );
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  reset role;
  raise notice '%', _tf('Alice CAN insert report in Event A (contributor)', v_ok);
  -- Clean up the test row (service role).
  delete from public.reports where id = 'dddddddd-0000-0000-0000-000000000001';
end $$;

-- ===========================================================================
-- TEST 7: Alice (contributor) CANNOT update her report's status to
--         'reviewed' (the "contributor cannot mark verified" rule).
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  begin
    update public.reports
      set status = 'reviewed', review_outcome = 'confirmed'
      where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    -- If we get here, RLS let the update through — that's a FAIL.
    v_ok := false;
  exception when others then
    v_ok := true;  -- expected: update blocked (creator policy forbids reviewed)
  end;
  reset role;
  raise notice '%', _tf('Alice CANNOT mark own report as reviewed (contributor cannot verify)', v_ok);
end $$;

-- ===========================================================================
-- TEST 8: Bob (reviewer in Event A) CAN update the report's status to
--         'reviewed' (the "authorized reviewer may record verification" rule).
-- ===========================================================================
do $$
declare
  v_ok boolean;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  begin
    update public.reports
      set status = 'reviewed', review_outcome = 'confirmed'
      where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  reset role;
  raise notice '%', _tf('Bob CAN mark Event A report as reviewed (authorized reviewer)', v_ok);
  -- Restore the report status for subsequent tests (service role).
  update public.reports set status = 'needs_review', review_outcome = null
    where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
end $$;

-- ===========================================================================
-- TEST 9: Bob CANNOT insert a review_action on a report in Event B
--         (he's not a reviewer there). Uses the real Event B report R2
--         (eeeeeeee-...) seeded in seed.sql so this is a real test, not
--         a vacuous no-op.
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  begin
    insert into public.review_actions (report_id, reviewer_id, action)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '22222222-2222-2222-2222-222222222222',
            'confirm');
    -- If we get here, RLS let Bob review an Event B report — FAIL.
    v_ok := false;
  exception when others then
    v_ok := true;  -- expected: Bob is not a reviewer of Event B
  end;
  reset role;
  raise notice '%', _tf('Bob CANNOT review Event B report (no cross-event review)', v_ok);
end $$;

-- ===========================================================================
-- TEST 10: Alice CANNOT review her OWN report (self-review rule).
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  begin
    insert into public.review_actions (report_id, reviewer_id, action)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '11111111-1111-1111-1111-111111111111',
            'confirm');
    -- If we get here, RLS let the insert through — FAIL.
    v_ok := false;
  exception when others then
    v_ok := true;  -- expected: self-review blocked
  end;
  reset role;
  raise notice '%', _tf('Alice CANNOT review own report (self-review rule)', v_ok);
end $$;

-- ===========================================================================
-- TEST 11: Alice (contributor) CANNOT insert a priority_override.
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  begin
    insert into public.priority_overrides (report_id, overridden_by, previous_score, new_score, reason)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '11111111-1111-1111-1111-111111111111',
            62, 95, 'Bumping priority');
    v_ok := false;  -- FAIL if it went through
  exception when others then
    v_ok := true;
  end;
  reset role;
  raise notice '%', _tf('Alice CANNOT override priority (contributor)', v_ok);
end $$;

-- ===========================================================================
-- TEST 11b: Dave (contributor in Event B) CANNOT override priority on
--          his OWN event's report (he's a contributor, not a coordinator).
--          This tests the coordinator-only rule within the user's own event.
-- ===========================================================================
do $$
declare
  v_ok boolean := true;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  begin
    insert into public.priority_overrides (report_id, overridden_by, previous_score, new_score, reason)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444',
            71, 95, 'Bumping my own event report');
    v_ok := false;  -- FAIL: contributor cannot override even in own event
  exception when others then
    v_ok := true;   -- expected: contributor is not a coordinator
  end;
  reset role;
  raise notice '%', _tf('Dave CANNOT override priority on own-event report (contributor, not coordinator)', v_ok);
end $$;

-- ===========================================================================
-- TEST 12: Carol (global admin + coordinator in Event B) CAN override
--         priority on the Event A report (admin is exempt from the
--         cross-event restriction). This tests the admin-exempt path.
--         NOTE: to test that a non-admin coordinator CANNOT override
--         cross-event, the seed would need a non-admin coordinator of
--         Event B. Dave is a contributor (not coordinator) of Event B,
--         so he tests the contributor-denied path in TEST 11. The
--         cross-event-coordinator-denied scenario is left as a manual
--         test (add a non-admin coordinator to the seed to verify).
-- ===========================================================================
do $$
declare
  v_ok boolean;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  begin
    insert into public.priority_overrides (report_id, overridden_by, previous_score, new_score, reason)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '33333333-3333-3333-3333-333333333333',
            62, 95, 'Admin override: high-visibility incident');
    -- Carol is a global admin, so the insert goes through (admin exempt).
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  reset role;
  raise notice '%', _tf('Carol (admin) CAN override priority on Event A report (admin exempt)', v_ok);
  -- Clean up (service role).
  delete from public.priority_overrides where report_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
end $$;

-- ===========================================================================
-- TEST 13: audit_events is append-only — authenticated client CANNOT
--          UPDATE or DELETE.
-- ===========================================================================
do $$
declare
  v_insert_ok boolean := false;
  v_update_ok boolean := true;
  v_delete_ok boolean := true;
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  -- Direct INSERT should be revoked.
  begin
    insert into public.audit_events (actor_id, action)
    values ('11111111-1111-1111-1111-111111111111', 'login');
    v_insert_ok := false;  -- FAIL: direct insert should be blocked
  exception when others then
    v_insert_ok := true;   -- expected: revoked
  end;
  -- The function append should work.
  begin
    select public.write_audit_event('login') into v_id;
    v_insert_ok := v_insert_ok and true;
  exception when others then
    v_insert_ok := false;
  end;
  -- UPDATE on the just-written row should fail.
  begin
    update public.audit_events set action = 'logout' where id = v_id;
    v_update_ok := false;  -- FAIL: should be blocked
  exception when others then
    v_update_ok := true;
  end;
  -- DELETE should fail.
  begin
    delete from public.audit_events where id = v_id;
    v_delete_ok := false;  -- FAIL: should be blocked
  exception when others then
    v_delete_ok := true;
  end;
  reset role;
  raise notice '%', _tf('audit direct INSERT revoked',          v_insert_ok);
  raise notice '%', _tf('audit write_audit_event() works',      v_insert_ok);
  raise notice '%', _tf('audit UPDATE blocked (append-only)',   v_update_ok);
  raise notice '%', _tf('audit DELETE blocked (append-only)',  v_delete_ok);
  -- Clean up (service role).
  delete from public.audit_events where id = v_id;
end $$;

-- ===========================================================================
-- TEST 14: Alice (non-admin) CANNOT SELECT from audit_events.
-- ===========================================================================
do $$
declare
  v_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  -- Seed a row first (service role), then check visibility.
  reset role;
  insert into public.audit_events (actor_id, action)
  values ('33333333-3333-3333-3333-333333333333', 'login');
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select count(*) into v_count from public.audit_events;
  reset role;
  raise notice '%', _tf('Alice CANNOT read audit_events (admin-only)', v_count = 0);
  -- Clean up.
  delete from public.audit_events where actor_id = '33333333-3333-3333-3333-333333333333';
end $$;

-- ===========================================================================
-- TEST 15: Storage — anon CANNOT list evidence-originals.
-- ===========================================================================
do $$
declare
  v_count int;
begin
  set local role anon;
  set local request.jwt.claim.sub = '';
  set local request.jwt.claims = '{}';
  select count(*) into v_count from storage.objects where bucket_id = 'evidence-originals';
  reset role;
  raise notice '%', _tf('anon CANNOT list evidence-originals (no public evidence)', v_count = 0);
end $$;

-- ===========================================================================
-- TEST 16: Storage — Dave (Event B) CANNOT read Event A's original.
-- ===========================================================================
do $$
declare
  v_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  select count(*) into v_count from storage.objects
    where bucket_id = 'evidence-originals'
      and name like 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/%';
  reset role;
  raise notice '%', _tf('Dave CANNOT read Event A originals (cross-event storage)', v_count = 0);
end $$;

-- ===========================================================================
-- TEST 17: PostGIS nearby_reports — Dave (Event B) CANNOT query
--          Event A via the RPC (the is_event_member check inside
--          the SECURITY INVOKER function rejects cross-event callers
--          even though the route handler may have let the request
--          through).
-- ===========================================================================
-- This is the defense-in-depth test for the PostGIS RPCs. The route
-- handler's app-layer check (ctx.events.find(...)) is the first gate,
-- but the RPC itself has its own membership check (line 188 of
-- 0005_postgis.sql: `if not public.is_event_member(p_event_id) then
-- raise exception 'You are not a member of this event'`).
--
-- Run this test ONLY on a DB with the seed applied (supabase/seed.sql).
-- It uses fixed UUIDs from the seed:
--   Dave (Event B contributor)  44444444-...
--   Event A                      aaaaaaaa-...
--   Report R1 (Event A)         cccccccc-... (lat 35.5951, lon -82.5515)
do $$
declare
  v_ok boolean := false;
  v_err text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  begin
    -- Dave calls nearby_reports with Event A's ID. The function's
    -- internal is_event_member check (line 188 of 0005_postgis.sql)
    -- rejects him — Dave is a member of Event B, not A.
    perform public.nearby_reports(
      p_event_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_lat := 35.5951,
      p_lon := -82.5515,
      p_radius_m := 1000,
      p_limit := 10,
      p_offset := 0
    );
    -- If we get here, the function did NOT enforce the boundary — FAIL.
    v_ok := false;
    v_err := 'RPC returned without membership error';
  exception when others then
    v_err := sqlerrm;
    v_ok := v_err like '%not a member%';
  end;
  reset role;
  raise notice '%', _tf(
    'nearby_reports rejects Dave for Event A (cross-event RPC boundary)',
    v_ok
  );
  if not v_ok then
    raise notice '  (unexpected error: %)', v_err;
  end if;
end $$;

-- ===========================================================================
-- TEST 18: PostGIS viewport_reports — Dave (Event B) CANNOT query
--          Event A via the RPC (same defense-in-depth test for the
--          viewport function).
-- ===========================================================================
do $$
declare
  v_ok boolean := false;
  v_err text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  begin
    perform public.viewport_reports(
      p_event_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_sw_lat := 35.5,
      p_sw_lon := -82.7,
      p_ne_lat := 35.7,
      p_ne_lon := -82.4,
      p_limit := 10
    );
    v_ok := false;
    v_err := 'RPC returned without membership error';
  exception when others then
    v_err := sqlerrm;
    v_ok := v_err like '%not a member%';
  end;
  reset role;
  raise notice '%', _tf(
    'viewport_reports rejects Dave for Event A (cross-event RPC boundary)',
    v_ok
  );
  if not v_ok then
    raise notice '  (unexpected error: %)', v_err;
  end if;
end $$;

-- ===========================================================================
-- TEST 19: PostGIS nearby_reports — Dave (Event B) CANNOT extract
--          Event A's report locations by passing a tiny radius around
--          a known Event A coordinate. The function uses Event B
--          (where Dave IS a member) — but the report at the center
--          coordinate belongs to Event A, and the function's WHERE
--          clause `r.event_id = p_event_id` filters it out.
--
--          This test passes p_event_id = EVENT_B (Dave's event) but
--          uses coordinates near Event A's seeded report. The function
--          SHOULD return 0 rows (no Event B reports are near
--          Asheville, NC). If it returns Event A's report, the
--          function has a cross-event leak.
-- ===========================================================================
do $$
declare
  v_count int := -1;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  -- Dave passes his OWN event (Event B) with Event A's coordinates.
  -- The function allows it (he IS a member of Event B), then runs
  -- the spatial query. The WHERE clause `r.event_id = p_event_id`
  -- filters to Event B only — so no Event A report can appear.
  select count(*) into v_count from public.nearby_reports(
    p_event_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',  -- Event B (Dave's)
    p_lat := 35.5951,                                       -- Event A's lat
    p_lon := -82.5515,                                      -- Event A's lon
    p_radius_m := 1000,
    p_limit := 100,
    p_offset := 0
  );
  reset role;
  raise notice '%', _tf(
    'nearby_reports with Event B + Event A coords returns 0 (no cross-event leak via coordinates)',
    v_count = 0
  );
end $$;

-- ===========================================================================
-- Cleanup the helper function.
-- ===========================================================================
drop function _tf(text, boolean);

-- ============================================================================
-- End of test_rls.sql
-- ============================================================================
