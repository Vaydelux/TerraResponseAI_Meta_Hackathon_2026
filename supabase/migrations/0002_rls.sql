-- ============================================================================
-- TerraResponse AI — Row-Level Security policies
-- ============================================================================
-- Prerequisite: 0001_schema.sql (tables + indices + triggers).
--
-- This file enables RLS on every exposed table and installs the
-- per-table SELECT / INSERT / UPDATE / DELETE policies. The design
-- rules (from the brief and docs/SECURITY.md):
--
--   1. No unauthenticated reads. Every SELECT policy requires
--      auth.uid() to match a known profile OR is_admin().
--   2. No cross-event reads. Report/anlysis/review SELECT policies
--      filter by event membership of the report's event_id.
--   3. A contributor may submit reports to events they're a member of
--      (role contributor+) but CANNOT mark them verified or edit
--      trusted analyses — only reviewers/coordinators/admins can.
--   4. Only authorized reviewers/admins may record verification
--      (insert review_actions). Reviewers may NOT review their own
--      reports.
--   5. Only a designated coordinator/admin may override priority
--      (insert priority_overrides). A non-empty reason is required.
--   6. audit_events is append-only: ordinary clients can append via
--      the SECURITY DEFINER write_audit_event() function; direct
--      INSERT/UPDATE/DELETE are revoked. SELECT is admin-only.
--   7. RLS does NOT rely on UI role checks — the policies are the
--      enforcement boundary. The UI hiding buttons is convenience,
--      not security.
--
-- The helper functions below are SECURITY DEFINER so they bypass RLS
-- on the tables they query (otherwise event_members RLS would be
-- circular). They are STABLE and have a fixed search_path to prevent
-- injection.
-- ============================================================================


-- ============================================================================
-- 1. RLS helper functions
-- ============================================================================
-- These run as SECURITY DEFINER (definer = owner = postgres/supabase_admin)
-- so they see ALL rows of the tables they query, regardless of the
-- invoking user's RLS. This is intentional: the policies call these
-- helpers to make decisions, so the helpers must see ground truth.
-- The search_path is pinned to public, pg_catalog to prevent
-- search_path-injection of a malicious same-named function.

-- is_admin(): true if the current user's global role is 'admin'.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- event_role(p_event_id, p_user_id): the user's role in the event, or
-- NULL if not a member. Defaults to the current user.
create or replace function public.event_role(
  p_event_id uuid,
  p_user_id  uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select em.role from public.event_members em
  where em.event_id = p_event_id and em.user_id = p_user_id;
$$;

-- is_event_member(p_event_id): true if the current user is a member of
-- the event (any role) OR is a global admin.
create or replace function public.is_event_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.event_role(p_event_id) is not null or public.is_admin();
$$;

-- is_event_reviewer_or_higher(p_event_id): reviewer, coordinator, or
-- admin. Used for review-actions + analysis visibility.
create or replace function public.is_event_reviewer_or_higher(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.event_role(p_event_id) in ('reviewer','coordinator')
         or public.is_admin();
$$;

-- is_event_contributor_or_higher(p_event_id): contributor, reviewer,
-- coordinator, or admin. Used for report INSERT.
create or replace function public.is_event_contributor_or_higher(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.event_role(p_event_id) in ('contributor','reviewer','coordinator')
         or public.is_admin();
$$;

-- is_event_coordinator_or_admin(p_event_id): coordinator of the event
-- OR global admin. Used for priority_overrides + event management.
create or replace function public.is_event_coordinator_or_admin(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.event_role(p_event_id) = 'coordinator' or public.is_admin();
$$;


-- ============================================================================
-- 2. profiles — RLS
-- ============================================================================
alter table public.profiles enable row level security;

-- SELECT: a user can read their own profile; admins can read all.
create policy profiles_select_self_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- INSERT: only on self-signup (id = auth.uid()). The trigger on
-- auth.users also inserts a profile; this policy covers the rare case
-- of a client creating their own profile row.
-- The `role = 'reporter'` constraint blocks self-promotion to admin
-- (a contributor can't bootstrap themselves to admin via the anon key
-- if the handle_new_user trigger fails to fire). The 0006 migration
-- reinforced this further with the trg_guard_profile_role trigger.
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'reporter');

-- UPDATE: a user can update their own name/email but NOT their role.
-- A separate policy lets admins update anyone (including role).
-- The role-immutability for self-updates is enforced by the
-- trg_guard_profile_role trigger (installed in 0006_security_fixes.sql
-- §5). The original 0002 version used `new.role = old.role` inside
-- WITH CHECK — invalid SQL (PostgreSQL RLS does NOT expose OLD/NEW
-- row variables inside policy expressions). The trigger is the
-- correct mechanism.
create policy profiles_update_self_no_role_change
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (true);

-- DELETE: admin only.
create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 3. events — RLS
-- ============================================================================
alter table public.events enable row level security;

-- SELECT: must be a member of the event OR admin. No cross-event
-- visibility — you only see events you belong to.
create policy events_select_member_or_admin
  on public.events for select
  to authenticated
  using (public.is_event_member(id));

-- INSERT: global admin only (events are admin-created).
create policy events_insert_admin
  on public.events for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE: admin OR the event's coordinator.
create policy events_update_coordinator_or_admin
  on public.events for update
  to authenticated
  using (public.is_event_coordinator_or_admin(id))
  with check (public.is_event_coordinator_or_admin(id));

-- DELETE: admin only.
create policy events_delete_admin
  on public.events for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 4. event_members — RLS
-- ============================================================================
alter table public.event_members enable row level security;

-- SELECT: members of the event can see the member list (so contributors
-- know who the reviewers are, etc.). Admins see all.
create policy event_members_select_member_or_admin
  on public.event_members for select
  to authenticated
  using (public.is_event_member(event_id) or public.is_admin());

-- INSERT: the event's coordinator (or admin) adds members.
create policy event_members_insert_coordinator_or_admin
  on public.event_members for insert
  to authenticated
  with check (public.is_event_coordinator_or_admin(event_id));

-- UPDATE: coordinator or admin changes a member's role.
create policy event_members_update_coordinator_or_admin
  on public.event_members for update
  to authenticated
  using (public.is_event_coordinator_or_admin(event_id))
  with check (public.is_event_coordinator_or_admin(event_id));

-- DELETE: coordinator or admin removes members.
create policy event_members_delete_coordinator_or_admin
  on public.event_members for delete
  to authenticated
  using (public.is_event_coordinator_or_admin(event_id));


-- ============================================================================
-- 5. reports — RLS
-- ============================================================================
alter table public.reports enable row level security;

-- SELECT: the report's creator, OR a reviewer/coordinator of the
-- report's event, OR admin. NOT cross-event (the event_id filter in
-- is_event_reviewer_or_higher enforces this).
create policy reports_select_creator_or_event_reviewer_or_admin
  on public.reports for select
  to authenticated
  using (
    creator_id = auth.uid()
    or public.is_event_reviewer_or_higher(event_id)
    or public.is_admin()
  );

-- INSERT: a contributor+ of the event, creating the report as
-- themselves. The creator_id must equal auth.uid() (no spoofing).
create policy reports_insert_contributor_self
  on public.reports for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    and public.is_event_contributor_or_higher(event_id)
  );

-- UPDATE (two policies, OR'd):
--   a) Creator can update own report ONLY while status is uploaded or
--      analyzing (before it enters the review pipeline). Cannot change
--      status to reviewed or set review_outcome — that's the
--      "contributor cannot mark verified" rule.
--   b) Reviewer/coordinator of the event can update status (review
--      actions) but cannot change trusted analysis fields.
--   c) Admin can do anything.
--
-- IMPORTANT: the original 0002 version of policy (b) used
-- `new.X = old.X` inside WITH CHECK to enforce immutability of the
-- evidence columns (sha256, storage keys, image_*). That is
-- INVALID SQL — PostgreSQL RLS does NOT expose OLD/NEW row
-- variables inside policy expressions. The policy would fail to
-- create. The correct mechanism for column immutability is
-- column-level UPDATE privileges: REVOKE UPDATE on the immutable
-- columns from authenticated, GRANT UPDATE only on the mutable
-- columns. This is installed in 0006_security_fixes.sql §4. The
-- 0002 version of policy (b) below does NOT enforce column
-- immutability — it only does the role check (USING + WITH CHECK).
-- The 0006 column privileges enforce the immutability.
--
-- The original 0002 policy (a) used `old.status in ('uploaded',
-- 'analyzing')` inside WITH CHECK — also invalid SQL (no OLD/NEW
-- in WITH CHECK). The fix: WITH CHECK only verifies the candidate
-- row's columns (which are the NEW values, accessible by name
-- without the `new.` prefix). The USING clause already gates by
-- the OLD status (the row's current status column); WITH CHECK
-- verifies the NEW status is not 'reviewed' and review_outcome
-- is null.
create policy reports_update_creator_pre_review
  on public.reports for update
  to authenticated
  using (
    creator_id = auth.uid()
    and status in ('uploaded','analyzing')
  )
  with check (
    creator_id = auth.uid()
    and status not in ('reviewed')
    and review_outcome is null
  );

create policy reports_update_event_reviewer_or_admin
  on public.reports for update
  to authenticated
  using (
    public.is_event_reviewer_or_higher(event_id)
  )
  with check (
    public.is_event_reviewer_or_higher(event_id)
    -- Column immutability (sha256, storage keys, image_*, captured_at,
    -- uploaded_at, event_id, creator_id) is enforced by column-level
    -- UPDATE privileges installed in 0006_security_fixes.sql §4
    -- (REVOKE UPDATE on the immutable columns from authenticated,
    -- GRANT UPDATE only on the mutable columns). This policy only
    -- does the role check; the column privileges are the actual
    -- immutability boundary.
  );

-- DELETE: creator (only if pre-review) or admin.
create policy reports_delete_creator_pre_review_or_admin
  on public.reports for delete
  to authenticated
  using (
    (creator_id = auth.uid() and status in ('uploaded','analyzing'))
    or public.is_admin()
  );


-- ============================================================================
-- 6. report_analyses — RLS
-- ============================================================================
alter table public.report_analyses enable row level security;

-- SELECT: anyone who can SELECT the parent report. The analysis is
-- tied to the report; visibility follows the report. (The raw_usage_
-- metadata field is safe — it holds token counts, not secrets; the
-- raw model response text is not stored at all, see schema comment.)
create policy analyses_select_via_report
  on public.report_analyses for select
  to authenticated
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
  );

-- INSERT: a reviewer/coordinator of the report's event (manual
-- analysis when AI schema-invalid). The service role bypasses RLS for
-- automated analyses, so this policy only needs to cover client
-- inserts (reviewer manual entry).
create policy analyses_insert_event_reviewer
  on public.report_analyses for insert
  to authenticated
  with check (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and public.is_event_reviewer_or_higher(r.event_id)
    )
  );

-- UPDATE: no client UPDATE (the retry poller runs as the service role,
-- which bypasses RLS). Reviewers who correct an observation INSERT a
-- review_action row with the new observation rather than mutating this
-- row, preserving history. Admin can update if ever needed.
create policy analyses_update_admin
  on public.report_analyses for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: no client DELETE (cascade from report deletion handles it).
create policy analyses_delete_admin
  on public.report_analyses for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 7. review_actions — RLS (append-only for clients)
-- ============================================================================
alter table public.review_actions enable row level security;

-- SELECT: anyone who can SELECT the parent report.
create policy review_actions_select_via_report
  on public.review_actions for select
  to authenticated
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
  );

-- INSERT: the reviewer is the current user, is a reviewer/coordinator
-- of the report's event, AND is NOT the report's creator (no
-- self-review). Admin is exempt from the self-review rule (can review
-- anything) — recorded in docs/SECURITY.md §10.1.
create policy review_actions_insert_reviewer_not_self
  on public.review_actions for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = report_id
      and public.is_event_reviewer_or_higher(r.event_id)
      and r.creator_id <> auth.uid()
    )
  );

create policy review_actions_insert_admin
  on public.review_actions for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.is_admin()
  );

-- UPDATE: NO policy — append-only. Clients cannot UPDATE.
-- (No `for update` policy is created, so the default-deny applies.)

-- DELETE: NO policy — append-only. Clients cannot DELETE.


-- ============================================================================
-- 8. priority_overrides — RLS (append-only; coordinator/admin only)
-- ============================================================================
alter table public.priority_overrides enable row level security;

-- SELECT: the report's creator, OR an event reviewer/coordinator/admin
-- of the event, OR a global admin. The brief requires "explainable
-- prioritization" — reviewers see who overrode and why (it affects
-- their queue ordering). The H-3 fix from the Phase 17 audit added
-- `is_event_reviewer_or_higher` (which already includes coordinator +
-- admin, so the additional clauses are belt-and-suspenders).
create policy priority_overrides_select
  on public.priority_overrides for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_event_coordinator_or_admin(r.event_id)
        or public.is_admin()
      )
    )
  );

-- INSERT: the override actor is the current user, AND the current user
-- is a coordinator of the report's event OR a global admin. The schema
-- already requires a non-empty reason.
create policy priority_overrides_insert_coordinator_or_admin
  on public.priority_overrides for insert
  to authenticated
  with check (
    overridden_by = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = report_id
      and public.is_event_coordinator_or_admin(r.event_id)
    )
  );

-- UPDATE: NO policy — append-only.

-- DELETE: NO policy — append-only.


-- ============================================================================
-- 9. audit_events — RLS + append-only enforcement
-- ============================================================================
-- Design: ordinary clients may APPEND (via write_audit_event) but may
-- NOT read, update, or delete. SELECT is admin-only. The append is
-- mediated by a SECURITY DEFINER function so the actor_id is set from
-- auth.uid() and cannot be spoofed.

alter table public.audit_events enable row level security;

-- SELECT: admin only.
create policy audit_events_select_admin
  on public.audit_events for select
  to authenticated
  using (public.is_admin());

-- Revoke direct DML from authenticated. Clients append via the
-- function; the service role bypasses RLS for system-generated events.
revoke insert on public.audit_events from authenticated;
revoke update on public.audit_events from authenticated;
revoke delete on public.audit_events from authenticated;
revoke truncate on public.audit_events from authenticated;

-- write_audit_event(...): the ONLY way for an authenticated client to
-- append. SECURITY DEFINER so it runs with the owner's privileges
-- (bypassing the revoked INSERT). The actor_id is forced to auth.uid()
-- so a caller cannot forge another user's actions.
create or replace function public.write_audit_event(
  p_action      text,
  p_target_id   uuid default null,
  p_target_type text default null,
  p_metadata    jsonb default null,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  insert into public.audit_events (
    actor_id, action, target_id, target_type, metadata, ip, user_agent
  )
  values (
    auth.uid(), p_action, p_target_id, p_target_type,
    p_metadata, p_ip, p_user_agent
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.write_audit_event(
  text, uuid, text, jsonb, inet, text
) to authenticated;


-- ============================================================================
-- 10. Grants (defensive — Supabase defaults already grant to authenticated)
-- ============================================================================
-- Supabase's `authenticated` role already gets SELECT/INSERT/UPDATE/DELETE
-- on public tables by default; RLS is the real boundary. We revoke the
-- dangerous ones explicitly on the append-only tables to make the
-- intent unambiguous and to defend against a future grant mistake.

revoke update, delete, truncate on public.review_actions from authenticated;
revoke update, delete, truncate on public.priority_overrides from authenticated;

-- ============================================================================
-- 11. reports — column-level UPDATE privileges (evidence immutability)
-- ============================================================================
-- The original 0002 attempted to enforce evidence immutability via
-- `new.X = old.X` inside the WITH CHECK of the
-- `reports_update_event_reviewer_or_admin` policy. That is INVALID
-- SQL — PostgreSQL RLS does NOT expose OLD/NEW row variables inside
-- policy expressions. The policy would fail to create.
--
-- The CORRECT mechanism for "this column is immutable for this role"
-- is column-level UPDATE privileges. We:
--   1. REVOKE the full-table UPDATE from authenticated.
--   2. GRANT UPDATE only on the mutable columns.
--
-- Mutable columns (reviewers can change these):
--   status, review_outcome, priority_score, retry_count,
--   next_retry_at, last_error, title, description,
--   latitude, longitude, location_source, location_label
--
-- Immutable columns (the "evidence" — never changeable by reviewers
-- or contributors via the standard authenticated role):
--   id, event_id, creator_id, sha256,
--   original_storage_key, derivative_storage_key, thumbnail_storage_key,
--   image_mime_type, image_bytes, image_width, image_height,
--   captured_at, uploaded_at, retention_state, created_at
--
-- Note: retention_state is updated by the
-- trg_sync_reports_retention_state trigger (which runs as the table
-- owner, bypassing column privileges). The set_updated_at trigger
-- also runs as the table owner.
--
-- The 0006_security_fixes.sql migration re-applies these grants
-- (idempotent — `revoke` + `grant` are no-ops if already in the
-- desired state) and adds the trg_guard_profile_role +
-- trg_guard_retention_transition triggers.

revoke update on public.reports from authenticated;
grant update (
  status, review_outcome, priority_score,
  retry_count, next_retry_at, last_error,
  title, description,
  latitude, longitude, location_source, location_label
) on public.reports to authenticated;


-- ============================================================================
-- End of 0002_rls.sql
-- ============================================================================
