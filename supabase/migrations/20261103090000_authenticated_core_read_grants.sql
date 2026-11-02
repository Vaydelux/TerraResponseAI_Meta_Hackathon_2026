-- Production login/read hotfix, 2026-11-03.
--
-- Production has schema + RLS from 0001/0002 but not the explicit Data API
-- GRANTs from 0011. A valid Supabase JWT is accepted by /login middleware,
-- while the dashboard's profile SELECT fails with 42501 and redirects to
-- login. Both endpoints return HTTP 307 forever.
--
-- The narrowest safe repair is SELECT on the three tables used to assemble
-- an authenticated user's profile and event memberships. Existing RLS
-- policies continue to enforce self/member/admin visibility.
--
-- Do not grant anon, INSERT, UPDATE, DELETE, or BYPASSRLS.
-- This forward-only migration is safe to replay after 0011 (GRANT is
-- idempotent) and can be independently reverted with three REVOKEs if
-- a future verified migration supersedes it.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select on public.events to authenticated;
grant select on public.event_members to authenticated;
