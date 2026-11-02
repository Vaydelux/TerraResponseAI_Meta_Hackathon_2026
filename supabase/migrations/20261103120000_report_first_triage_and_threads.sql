-- Phase 2A: report-first community intake, AI triage and incident thread data.
-- Staging-first additive migration. Never bypass existing report RLS.
-- Publication / verification remain independent. The AI NEVER sets "confirmed".
-- Source 20261103120000 is newer than all existing recorded timestamps.

-- A system-controlled broad event is a routing container, NOT an incident.
-- Create only when an existing, authorized app administrator is available.
insert into public.events (slug, name, description, status, created_by)
select 'community-intake', 'Community Disaster Reports',
       'Shared intake for community-submitted potential disaster evidence.', 'active', p.id
from public.profiles p
where p.role = 'admin'
order by p.created_at, p.id
limit 1
on conflict (slug) do nothing;

create table if not exists public.report_triage (
  report_id uuid primary key references public.reports(id) on delete cascade,
  incident_type text not null,
  preliminary_severity smallint check (preliminary_severity between 1 and 5),
  triage_class text not null check (triage_class in (
    'critical_provisional','high_review','moderate_review','low_review','unrelated_review','uncertain_review'
  )),
  verification_status text not null default 'awaiting_human'
    check (verification_status in ('awaiting_human','confirmed','rejected')),
  -- Do not expose any data automatically until an explicit, tested
  -- publication endpoint and RLS policy exist. Urgent is a queue priority.
  publication_status text not null default 'private'
    check (publication_status in ('private','public_provisional','public_verified')),
  reason_code text not null,
  triage_policy_version text not null,
  is_ai_generated boolean not null default true,
  model_id text,
  processed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_report_triage_queue
  on public.report_triage (triage_class, processed_at desc);

create table if not exists public.incident_threads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  incident_type text not null check (incident_type in (
    'flooding','blocked_road','debris','visible_structural_damage','other','unclear'
  )),
  title text not null check (length(title) between 1 and 200),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'provisional'
    check (status in ('provisional','verified','closed')),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index if not exists idx_incident_threads_event_type
  on public.incident_threads(event_id, incident_type, last_observed_at desc);
create index if not exists idx_incident_threads_geo
  on public.incident_threads using gist (
    (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography)
  ) where latitude is not null and longitude is not null;

create table if not exists public.incident_report_links (
  report_id uuid primary key references public.reports(id) on delete cascade,
  incident_id uuid not null references public.incident_threads(id) on delete cascade,
  assignment_method text not null check (assignment_method in ('automatic','suggested','reviewer')),
  -- A proximity suggestion is not evidence confirmation.
  confirmed_match boolean not null default false,
  distance_m integer check (distance_m between 0 and 10000),
  linked_at timestamptz not null default now()
);
create index if not exists idx_incident_links_incident
  on public.incident_report_links(incident_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  kind text not null check (kind in (
    'report_submitted','triage_completed','critical_provisional',
    'review_required','review_completed','incident_grouped','role_changed'
  )),
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);

-- Service-role background processing writes, never reporter/admin clients.
-- Keep all evidence private; do not expose notification data to anon.
alter table public.report_triage enable row level security;
alter table public.incident_threads enable row level security;
alter table public.incident_report_links enable row level security;
alter table public.notifications enable row level security;

revoke all on public.report_triage, public.incident_threads,
  public.incident_report_links, public.notifications from anon, authenticated, public;
grant all on public.report_triage, public.incident_threads,
  public.incident_report_links, public.notifications to service_role;
grant select on public.report_triage, public.incident_threads,
  public.incident_report_links, public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists report_triage_read_authorized_report on public.report_triage;
create policy report_triage_read_authorized_report
  on public.report_triage for select to authenticated
  using (exists(select 1 from public.reports r where r.id=report_id));
drop policy if exists incident_link_read_authorized_report on public.incident_report_links;
create policy incident_link_read_authorized_report
  on public.incident_report_links for select to authenticated
  using (exists(select 1 from public.reports r where r.id=report_id));
drop policy if exists incident_thread_read_authorized_report on public.incident_threads;
create policy incident_thread_read_authorized_report
  on public.incident_threads for select to authenticated
  using (exists(
    select 1 from public.incident_report_links l
    join public.reports r on r.id=l.report_id
    where l.incident_id=incident_threads.id
  ));
drop policy if exists notifications_read_self on public.notifications;
create policy notifications_read_self on public.notifications
  for select to authenticated using (recipient_id=(select auth.uid()));
drop policy if exists notifications_mark_self_read on public.notifications;
create policy notifications_mark_self_read on public.notifications
  for update to authenticated using (recipient_id=(select auth.uid()))
  with check (recipient_id=(select auth.uid()));

-- Only the server-held service-role connection may perform matching.
-- SQL-language function uses PostGIS distance index and a bounded window;
-- no reporter can call it via the Data API.
create or replace function public.find_community_incident_candidates(
  p_event_id uuid, p_type text, p_lat double precision,
  p_lon double precision, p_radius_m integer default 5000
)
returns table(incident_id uuid, distance_m double precision)
language sql stable security invoker
set search_path = ''
as $$
  select i.id,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(i.longitude,i.latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326)::extensions.geography
    ) as distance_m
  from public.incident_threads i
  where i.event_id = p_event_id
    and i.incident_type = p_type
    and i.status <> 'closed'
    and i.last_observed_at > now() - interval '48 hours'
    and i.latitude is not null and i.longitude is not null
    and p_lat between -90 and 90 and p_lon between -180 and 180
    and p_radius_m between 1 and 10000
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(i.longitude,i.latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326)::extensions.geography,
      p_radius_m
    )
  order by distance_m asc limit 10
$$;
revoke all on function public.find_community_incident_candidates(
  uuid,text,double precision,double precision,integer
) from public, anon, authenticated;
grant execute on function public.find_community_incident_candidates(
  uuid,text,double precision,double precision,integer
) to service_role;
