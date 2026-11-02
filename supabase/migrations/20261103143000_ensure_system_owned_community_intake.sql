-- Report-first: system-owned intake exists independently of a human admin.
-- Safe for both staging (pre-existing intake) and newly provisioned production.
-- All normal events still require an actual creating user, and existing
-- foreign keys, RLS, and audit permissions remain in effect.

alter table public.events alter column created_by drop not null;

do $guard$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_system_owner_guard'
  ) then
    alter table public.events
      add constraint events_system_owner_guard
      check (created_by is not null or slug = 'community-intake');
  end if;
end
$guard$;

-- This is a routing workspace, not an emergency declaration.
-- Never invent an administrator or assign privileges to the first user.
insert into public.events (slug, name, description, status, created_by)
values (
  'community-intake',
  'Community Disaster Reports',
  'System-owned intake for unverified community photo reports. Not a declared disaster.',
  'active',
  null
)
on conflict (slug) do nothing;

comment on column public.events.created_by is
  'Null only for the fixed system-owned community-intake workspace; other events require an authenticated organizer.';
