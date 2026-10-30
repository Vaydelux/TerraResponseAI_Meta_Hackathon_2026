-- ============================================================================
-- TerraResponse AI — Minimal seed scaffolding
-- ============================================================================
-- DEV/DEMO ONLY. This seed inserts demo users with empty bcrypt hashes
-- (sign-in is NOT possible — these rows exist solely so the RLS test
-- suite has profiles/events/reports to probe). For a real Supabase
-- project, use the secure first-admin bootstrap path:
--
--   1. Sign up at /login (the handle_new_user trigger creates a
--      profile with role='reporter').
--   2. Run: bun run scripts/bootstrap-admin.ts <your-email>
--      (refuses if any admin already exists — one-time gate).
--   3. (Optional, dev/demo only) Run scripts/seed-demo.ts against a
--      LOCAL Supabase (supabase start). The script refuses to seed
--      against a non-local URL unless ALLOW_DEMO_SEED_ON_PRODUCTION=1
--      is set, and refuses to use any default password.
--
-- Do NOT run this file against a production Supabase project. It uses
-- empty passwords for the demo users — they cannot sign in, but the
-- rows themselves are not appropriate for production.
--
-- Run AFTER 0001_schema.sql + 0002_rls.sql + 0003_storage.sql.
--
-- This seed creates four demo users, two demo events, and the
-- membership rows that make the RLS test scenarios work. It is meant
-- to be run via the service role (which bypasses RLS) so it can write
-- profiles, events, and event_members directly.
--
-- Run:
--   supabase db seed               # Supabase CLI
--   psql "$DB_URL" -f supabase/seed.sql
--
-- The demo users are created in auth.users first (so the
-- on_auth_user_created trigger fires and inserts a profiles row),
-- then the profiles role is updated, then events + memberships.
--
-- NOTE: the auth.users inserts below are for LOCAL Supabase (`supabase
-- start`) or a vanilla PostgreSQL with the auth schema stubbed. On a
-- real Supabase project, direct INSERTs into auth.users may fail
-- (the `auth` schema is managed by GoTrue, and the `encrypted_password`
-- column may have a CHECK requiring a valid bcrypt hash). For a real
-- Supabase project, use `scripts/seed-demo.ts` instead — it uses the
-- Supabase Auth admin API (`supabase.auth.admin.createUser()`) which
-- is the supported path.
--
-- If `supabase db seed` fails on the auth.users INSERT below, that's
-- expected on a hosted Supabase project. Skip this seed and use
-- `bun run db:seed-demo` (which uses the Auth admin API).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Demo users in auth.users (passwords are bcrypt-hashed placeholders;
--    replace via the Supabase Auth admin API in a real project).
--    The UUIDs are fixed so the test script can reference them.
-- ---------------------------------------------------------------------------
-- Alice  — global reporter; contributor in event A
-- Bob    — global reviewer; reviewer in event A
-- Carol  — global admin; coordinator in event B
-- Dave   — global reporter; contributor in event B (the "second
--          unaffiliated user" for the cross-event RLS test)

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, role, aud, instance_id)
values
  ('11111111-1111-1111-1111-111111111111', 'reporter@terra.ai',  '', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'reviewer@terra.ai',  '', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('33333333-3333-3333-3333-333333333333', 'admin@terra.ai',     '', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@terra.ai',  '', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- The on_auth_user_created trigger inserts profiles rows. Update the
-- role + name for each.
update public.profiles set name = 'Demo Reporter', role = 'reporter' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Demo Reviewer', role = 'reviewer' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Demo Admin',    role = 'admin'    where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'Demo Outsider',  role = 'reporter' where id = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- 2. Demo events (created by the admin)
-- ---------------------------------------------------------------------------
insert into public.events (id, slug, name, description, status, location_label, created_by)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'helene-asheville-2024',
   'Hurricane Helene — Asheville',
   'Demo event for the Hurricane Helene response in Asheville, NC.',
   'active',
   'Asheville, NC',
   '33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'la-wildfires-pacific-palisades-2025',
   'LA Wildfires — Pacific Palisades',
   'Demo event for the Pacific Palisades wildfire response.',
   'active',
   'Pacific Palisades, CA',
   '33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Event memberships
-- ---------------------------------------------------------------------------
-- Event A (Helene):
--   Alice    — contributor (can submit reports)
--   Bob      — reviewer    (can review reports, NOT Alice's own)
-- Event B (Wildfires):
--   Carol    — coordinator (can manage members + override priority)
--   Dave     — contributor (the "second unaffiliated user"; should NOT
--              see Event A's reports)
insert into public.event_members (event_id, user_id, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'contributor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'reviewer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'coordinator'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'contributor')
on conflict (event_id, user_id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- 4. Demo reports (so the RLS tests have rows to probe in both events)
-- ---------------------------------------------------------------------------
-- Report R1 in Event A (created by Alice) — the primary cross-event test row.
-- Report R2 in Event B (created by Dave) — so TEST 9 (Bob cannot insert a
-- review_action on an Event B report) has a real row to probe instead of
-- being a vacuous no-op.
insert into public.reports (
  id, event_id, creator_id, status, title, description,
  latitude, longitude, location_source, location_label,
  original_storage_key, derivative_storage_key, thumbnail_storage_key,
  sha256, image_mime_type, image_bytes, image_width, image_height,
  captured_at, uploaded_at, priority_score
)
values
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'needs_review',
  'Flooded road near downtown',
  'Water covering both lanes, vehicles stalled.',
  35.5951, -82.5515, 'gps', 'Asheville, NC',
  'evidence-originals/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg',
  'evidence-derivatives/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg',
  'evidence-thumbnails/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',  -- sha256 of empty string; replace with real digest
  'image/jpeg', 102400, 800, 600,
  now() - interval '1 hour', now(), 62
),
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '44444444-4444-4444-4444-444444444444',
  'needs_review',
  'Wildfire damage on Pacific Coast Highway',
  'Smoke and flame visible from the highway.',
  34.0359, -118.5186, 'gps', 'Pacific Palisades, CA',
  'evidence-originals/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg',
  'evidence-derivatives/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg',
  'evidence-thumbnails/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',  -- sha256 of empty string; replace with real digest
  'image/jpeg', 102400, 800, 600,
  now() - interval '30 minutes', now(), 71
)
on conflict (id) do nothing;

commit;

-- ============================================================================
-- End of seed.sql
-- ============================================================================
