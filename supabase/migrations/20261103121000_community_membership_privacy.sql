-- Phase 2A community intake privacy hardening.
-- Before community-wide enrollment, restrict membership enumeration.
-- Reporters see only their own event memberships. Event reviewers or
-- admins see membership rosters needed for moderation.
-- Existing helper is_event_reviewer_or_higher is a reviewed hardened
-- function; policy remains scoped to authenticated callers.
drop policy if exists event_members_select_member_or_admin on public.event_members;
create policy event_members_select_member_or_admin
  on public.event_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_event_reviewer_or_higher(event_id)
    or public.is_admin()
  );
