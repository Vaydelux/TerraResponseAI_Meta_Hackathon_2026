-- TerraResponse AI: explicitly expose RLS-protected tables to the Data API.
--
-- 0001 and 0002 create tables and RLS policies, but the connected hosted
-- Supabase project has NO table privileges for authenticated or service_role.
-- BYPASSRLS does not imply PostgreSQL table SELECT/INSERT privileges.
--
-- This forward-only migration is deliberately narrow: anon gets NO grants;
-- authenticated gets only operations already described by RLS policies;
-- service_role is trusted server-side and still requires privileged secret.
-- MUST be reviewed and applied on staging, after 0003..0010, not silently
-- deployed to the live project.

grant usage on schema public to authenticated, service_role;

-- Allow authenticated operations only within the existing RLS rules.
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_members to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.report_analyses to authenticated;
grant select, insert on public.review_actions to authenticated;
grant select, insert on public.priority_overrides to authenticated;
grant select on public.audit_events to authenticated;

-- The service role is available ONLY on the server. Needed for the pre-auth
-- login audit, server-side analysis, controlled onboarding and admin flows.
-- This does not grant any capabilities to anonymous/public clients.
grant select, insert, update, delete on
  public.profiles, public.events, public.event_members, public.reports,
  public.report_analyses, public.review_actions, public.priority_overrides,
  public.audit_events to service_role;

-- Current public tables use UUID keys. Grant sequence access defensively
-- for any existing identity/serial sequences in the public schema.
grant usage, select on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

-- Confirm in staging before production:
-- select has_table_privilege('service_role','public.audit_events','SELECT'),
--        has_table_privilege('authenticated','public.profiles','SELECT');
-- RLS remains ON and membership tests MUST pass with real reporter/reviewer
-- tokens before deployment to any incident data environment.
