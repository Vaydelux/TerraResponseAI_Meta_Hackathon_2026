-- ============================================================================
-- TerraResponse AI — Storage buckets + policies
-- ============================================================================
-- Prerequisite: 0001_schema.sql + 0002_rls.sql (event_members must
-- exist and be RLS-protected for the membership lookups below).
--
-- Design (from the brief):
--   * Private storage buckets (public=false). No public evidence
--     objects — neither originals nor derivatives are world-readable.
--   * Access is limited to event members. A user must be a member of
--     the event that owns the evidence to read or write the object.
--   * The server mints short-lived signed URLs (via the Supabase client
--     SDK's createSignedUrl) and hands them to authorized clients. The
--     signed URL is the "authorized short-lived" token; the RLS policy
--     governs who can CREATE a signed URL.
--   * Folder layout: <bucket>/<event_id>/<report_id>.<ext>
--     The first path segment is the event_id, so the membership check
--     is `(storage.foldername(name))[1] = event_id::text`.
--
-- Buckets:
--   evidence-originals   — the raw uploaded file, EXIF intact. Read by
--                          the contributor + event reviewers/admins.
--                          Written by event contributors+.
--   evidence-derivatives — the EXIF-stripped, re-encoded JPEG used for
--                          reviewer display + AI inference. Read by
--                          event members. Written by the service role.
--   evidence-thumbnails  — small thumbnails for list views. Read by
--                          event members. Written by the service role.
-- ============================================================================


-- ============================================================================
-- 1. Create the three private buckets
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('evidence-originals',  'evidence-originals',  false),
  ('evidence-derivatives','evidence-derivatives',false),
  ('evidence-thumbnails', 'evidence-thumbnails', false)
on conflict (id) do update set public = false;


-- ============================================================================
-- 2. Helper: is the current user a member of the event whose id is the
--    first folder segment of a storage object's name?
-- ============================================================================
-- storage.foldername(name) returns the path components. For
-- `evidence-originals/<event_id>/<report_id>.jpg` the first segment is
-- <event_id>. We reuse public.is_event_member() from 0002_rls.sql.
--
-- This helper is SECURITY DEFINER (it calls is_event_member which is
-- also SECURITY DEFINER) so it sees the real event_members rows.

create or replace function public.storage_event_member(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, storage
as $$
  select public.is_event_member(
    nullif((storage.foldername(p_object_name))[1], '')::uuid
  );
$$;

create or replace function public.storage_event_contributor_or_higher(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, storage
as $$
  select public.is_event_contributor_or_higher(
    nullif((storage.foldername(p_object_name))[1], '')::uuid
  );
$$;

create or replace function public.storage_event_reviewer_or_higher(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, storage
as $$
  select public.is_event_reviewer_or_higher(
    nullif((storage.foldername(p_object_name))[1], '')::uuid
  );
$$;


-- ============================================================================
-- 3. RLS on storage.objects
-- ============================================================================
-- IMPORTANT: Supabase's hosted storage enables RLS on storage.objects
-- BY DEFAULT on every project. We do NOT run `alter table storage.objects
-- enable row level security` here because:
--   1. It's a no-op on Supabase (RLS is already on).
--   2. The `postgres` user is NOT the owner of storage.objects (the
--      `supabase_storage_admin` role is) — running ALTER TABLE would
--      fail with "must be owner of table objects" (SQLSTATE 42501).
-- On a vanilla PostgreSQL (no Supabase), the operator must enable RLS
-- manually: `alter table storage.objects enable row level security;`
-- (as the storage schema owner). The policies below assume RLS is on.
-- The pgTAP test runner (scripts/_run_sql_tests.ts) enables RLS
-- explicitly in its stub because PGlite doesn't ship with the Supabase
-- storage defaults.

-- ============================================================================
-- 4. evidence-originals — policies
-- ============================================================================
-- Read: the contributor (owner of the report) OR an event reviewer/
-- coordinator/admin. We can't cheaply check "is this user the report's
-- creator" from the storage object name alone (the report_id is the
-- second segment, not the creator_id), so for originals we restrict
-- read to reviewer+ of the event; the contributor reads their own
-- original via the SAME signed-URL path the server mints (the server
-- checks creator_id before minting). This is defense-in-depth: even
-- if a contributor could mint a signed URL, they'd only get their own
-- event's objects.

create policy originals_select_event_reviewer_or_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence-originals'
    and public.storage_event_reviewer_or_higher(name)
  );

-- Write: event contributor+ (the contributor uploads; reviewer/
-- coordinator/admin can also upload). The creator check (creator_id =
-- auth.uid()) is enforced at the /api/reports route handler, not here
-- — storage can't see the report row yet during upload.
create policy originals_insert_event_contributor
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence-originals'
    and public.storage_event_contributor_or_higher(name)
  );

-- Update: service role only (e.g., to replace a corrupted upload).
-- No client UPDATE policy → default deny for authenticated.
create policy originals_update_admin
  on storage.objects for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Delete: admin only (cascade delete is handled at the report level;
-- the server uses the service role to delete the storage object).
create policy originals_delete_admin
  on storage.objects for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 4. evidence-derivatives — policies
-- ============================================================================
-- Read: any event member (the derivative is the "safe" view — EXIF
-- stripped, used for reviewer display and AI inference).
create policy derivatives_select_event_member
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence-derivatives'
    and public.storage_event_member(name)
  );

-- Write: service role only (the server produces derivatives from the
-- original via sharp). No client INSERT → default deny for
-- authenticated. (The service role bypasses RLS.)
-- (No insert policy created for authenticated.)

-- Update/delete: admin only.
create policy derivatives_update_admin
  on storage.objects for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy derivatives_delete_admin
  on storage.objects for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 5. evidence-thumbnails — policies
-- ============================================================================
-- Same pattern as derivatives: event members read; service role writes;
-- admin updates/deletes.
create policy thumbnails_select_event_member
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence-thumbnails'
    and public.storage_event_member(name)
  );

create policy thumbnails_update_admin
  on storage.objects for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy thumbnails_delete_admin
  on storage.objects for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 6. Server-side signed-URL pattern (documentation)
-- ============================================================================
-- The Next.js server mints signed URLs using the service-role key
-- (server-side only — never in the browser):
--
--   import { createClient } from '@supabase/supabase-js'
--   const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
--   const { data, error } = await supabase
--     .storage
--     .from('evidence-derivatives')
--     .createSignedUrl(`${eventId}/${reportId}.jpg`, 60)  // 60-second TTL
--
-- The server first checks `requireUser` + `canAccessReport` (app-layer
-- authz) before minting, then hands the signed URL to the authorized
-- client. The URL expires after 60s; the bucket is private so the URL
-- is the only way in. This is the "authorized short-lived signed URL"
-- pattern the brief requires.
--
-- The service-role key MUST stay server-side (docs/SECURITY.md §7).
-- It bypasses RLS; the app-layer authz is the check that gates access.
-- ============================================================================


-- ============================================================================
-- End of 0003_storage.sql
-- ============================================================================
