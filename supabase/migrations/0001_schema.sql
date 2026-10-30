-- ============================================================================
-- TerraResponse AI — Initial schema (tables, constraints, indices, triggers)
-- ============================================================================
-- Target:  PostgreSQL 14+ / Supabase
-- Depends: auth.users (Supabase Auth), auth.uid() / auth.jwt()
--
-- This migration creates the 8 tables requested in the brief:
--   profiles, events, event_members, reports, report_analyses,
--   review_actions, priority_overrides, audit_events
--
-- RLS policies live in 0002_rls.sql (loaded after this file).
-- Storage buckets + policies live in 0003_storage.sql.
--
-- Conventions:
--   * Enum-like fields use CHECK constraints (not Postgres ENUMs) so new
--     values can be added without a migration.
--   * All tables have created_at; mutable tables also have updated_at
--     kept current by a trigger.
--   * UUIDs via gen_random_uuid() (pgcrypto / Postgres 13+ builtin).
--   * Timestamps are timestamptz (UTC, timezone-aware).
--   * Foreign keys are explicit with onDelete policies chosen per-table.
--   * Evidence storage keys are text (the bucket + path), NOT URLs — the
--     server mints short-lived signed URLs at read time (see README §6).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. profiles  (extends auth.users with the app role + display name)
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  -- Global role. Event-scoped roles live in event_members.
  role        text not null default 'reporter'
              check (role in ('reporter','reviewer','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'App-level profile for each auth.users row. Holds the global role
   (reporter | reviewer | admin). Event-scoped roles live in
   event_members.';

-- ============================================================================
-- 2. events  (an incident event groups reports; admin-created)
-- ============================================================================
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name           text not null,
  description    text,
  status         text not null default 'active'
                 check (status in ('active','closed','archived')),
  location_label text,
  -- Optional bounding box for map auto-zoom. All four are null or all four
  -- are set; min <= max enforced below.
  bbox_min_lat   double precision check (bbox_min_lat between -90 and 90),
  bbox_min_lon   double precision check (bbox_min_lon between -180 and 180),
  bbox_max_lat   double precision check (bbox_max_lat between -90 and 90),
  bbox_max_lon   double precision check (bbox_max_lon between -180 and 180),
  created_by     uuid not null references public.profiles(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz,
  -- Bounding box is all-null or all-set.
  check ((bbox_min_lat is null) = (bbox_max_lat is null)),
  check ((bbox_min_lon is null) = (bbox_max_lon is null)),
  -- min <= max when present.
  check (bbox_min_lat is null or bbox_min_lat <= bbox_max_lat),
  check (bbox_min_lon is null or bbox_min_lon <= bbox_max_lon)
);

comment on table public.events is
  'An incident event (e.g., "Hurricane Helene — Asheville"). Admin-
   created. Reports belong to exactly one event. Per-event membership
   is enforced by event_members + RLS.';

-- ============================================================================
-- 3. event_members  (per-event role: contributor | reviewer | coordinator)
-- ============================================================================
create table if not exists public.event_members (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'contributor'
              check (role in ('contributor','reviewer','coordinator')),
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

comment on table public.event_members is
  'Per-event membership. A user has exactly one role per event:
   contributor (can submit reports), reviewer (can review reports),
   coordinator (can manage membership + override priority). The
   global profiles.role is separate (admin is global-only).';

-- ============================================================================
-- 4. reports  (a disaster-photo submission)
-- ============================================================================
create table if not exists public.reports (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id) on delete restrict,
  creator_id              uuid not null references public.profiles(id) on delete cascade,

  -- Lifecycle (see docs/BUILD_PLAN.md §2). review_outcome is set when
  -- status = reviewed.
  status                  text not null default 'uploaded'
                          check (status in (
                            'uploaded','analyzing','needs_review',
                            'needs_manual_review','reviewed','retryable_error'
                          )),
  review_outcome          text check (review_outcome in (
                            'confirmed','flagged','rejected','resolved'
                          )),

  -- Free-text metadata from the contributor.
  title                   text,
  description             text,

  -- Location. coordinates are nullable; location_source records how the
  -- location was obtained. unknown → coordinates must be null.
  latitude                double precision check (latitude between -90 and 90),
  longitude               double precision check (longitude between -180 and 180),
  location_source         text not null default 'unknown'
                          check (location_source in ('gps','manual','unknown')),
  location_label          text,

  -- Evidence storage. Three keys: the private original (never served
  -- to anyone but the contributor), the display/inference derivative
  -- (stripped of EXIF, re-encoded), and a thumbnail. All point into the
  -- private storage buckets (0003_storage.sql). The server mints
  -- short-lived signed URLs at read time.
  --
  -- Key convention: each key is the FULL path including the bucket
  -- name as the first segment, e.g.:
  --   'evidence-originals/<event_id>/<report_id>.jpg'
  --   'evidence-derivatives/<event_id>/<report_id>.jpg'
  --   'evidence-thumbnails/<event_id>/<report_id>.jpg'
  -- The app layer splits the key on '/' to get the bucket (first
  -- segment) and the path-within-bucket (remaining segments). The
  -- storage.objects.name column stores only the path-within-bucket
  -- (e.g. '<event_id>/<report_id>.jpg'), so the storage RLS policies
  -- in 0003_storage.sql check the FIRST folder segment of the
  -- path-within-bucket (which is the event_id) — NOT the bucket name.
  original_storage_key    text not null,
  derivative_storage_key  text,
  thumbnail_storage_key   text,

  -- Image digest + metadata. sha256 is the lowercase hex digest of the
  -- original file bytes — used for dedup detection (future) and integrity.
  sha256                  text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  image_mime_type         text not null check (image_mime_type in (
                            'image/jpeg','image/png'
                          )),
  image_bytes             integer not null check (image_bytes >= 0),
  image_width             integer check (image_width is null or image_width > 0),
  image_height            integer check (image_height is null or image_height > 0),

  -- Time the photo was taken (from EXIF) and when it was uploaded.
  captured_at             timestamptz,
  uploaded_at             timestamptz not null default now(),

  -- Human-review priority (0–100). Computed server-side; overridable only
  -- by coordinator/admin via priority_overrides.
  priority_score          integer check (
                            priority_score is null
                            or priority_score between 0 and 100
                          ),

  -- Retry tracking for the AI analysis poller.
  retry_count             integer not null default 0 check (retry_count >= 0),
  next_retry_at           timestamptz,
  last_error              text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- location_source = unknown → coordinates must be null (and vice versa
  -- for gps/manual → coordinates required).
  check (
    (location_source = 'unknown'  and latitude is null and longitude is null)
    or
    (location_source in ('gps','manual')
       and latitude is not null and longitude is not null)
  ),
  -- status = reviewed ⇔ review_outcome is not null.
  check (
    (status = 'reviewed') = (review_outcome is not null)
  )
);

comment on table public.reports is
  'A disaster-photo submission. Belongs to one event, created by one
   contributor. The original image lives in a private storage bucket
   (original_storage_key); derivatives (display/inference, thumbnail)
   are stripped of EXIF and re-encoded. The server mints short-lived
   signed URLs — no public read access.';

-- ============================================================================
-- 5. report_analyses  (1:1 with reports; the AI preliminary observation)
-- ============================================================================
create table if not exists public.report_analyses (
  id                      uuid primary key default gen_random_uuid(),
  report_id               uuid not null unique
                          references public.reports(id) on delete cascade,

  -- Which model + which prompt + which response schema produced this.
  -- Together these identify the exact inference run for audit.
  model_id                text not null,
  prompt_version          text not null,
  schema_version          text not null default 'v1',

  -- The parsed, cleaned observation. This is the structured field set
  -- the reviewer sees. Stored as jsonb so the schema can evolve with
  -- schema_version. The raw model response text is NOT stored (it
  -- could carry prompt-injection; storing only the parsed observation
  -- bounds the exposure surface — see docs/SECURITY.md §6.4).
  structured_observation  jsonb not null,

  -- Preliminary severity (0–100) and uncertainty (0–1, like a confidence
  -- interval half-width). Reviewers can override; the override is
  -- recorded in review_actions.
  severity_score          integer check (
                            severity_score is null
                            or severity_score between 0 and 100
                          ),
  severity_uncertainty    real check (
                            severity_uncertainty is null
                            or severity_uncertainty between 0 and 1
                          ),

  -- Operational metadata about the model call (token counts, latency,
  -- model-side request id). NO secrets, NO raw response text. This is
  -- safe for reviewers to read; admins use it for cost tracking.
  raw_usage_metadata      jsonb,

  -- Processing lifecycle.
  processing_status       text not null default 'pending'
                          check (processing_status in (
                            'pending','running','succeeded',
                            'failed','schema_invalid'
                          )),
  error_message           text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  completed_at            timestamptz
);

comment on table public.report_analyses is
  'The AI preliminary structured observation for a report (1:1).
   Stores the parsed observation, severity, uncertainty, and
   operational metadata. The raw model response text is intentionally
   NOT stored (prompt-injection safety, docs/SECURITY.md §6.4).
   raw_usage_metadata holds token counts / latency / model request id —
   no secrets.';

-- ============================================================================
-- 6. review_actions  (append-only history of reviewer decisions)
-- ============================================================================
create table if not exists public.review_actions (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null references public.reports(id) on delete cascade,
  -- reviewer is ON DELETE RESTRICT so a reviewer with actions can't be
  -- silently removed (the audit trail must name them).
  reviewer_id           uuid not null references public.profiles(id) on delete restrict,
  action                text not null
                        check (action in (
                          'confirm','flag','reject','resolve',
                          'assign','comment'
                        )),
  comment               text,

  -- Status transition (for the lifecycle audit).
  previous_status       text,
  new_status            text,

  -- Before/after observation snapshots. When a reviewer corrects the AI's
  -- observation, the old + new values are preserved here so the change is
  -- auditable.
  previous_observation  jsonb,
  new_observation       jsonb,
  previous_severity     integer,
  new_severity          integer,

  created_at            timestamptz not null default now()
);

comment on table public.review_actions is
  'Append-only history of reviewer decisions on a report. Captures
   before/after status, observation, and severity so corrections are
   auditable. reviewer_id is ON DELETE RESTRICT to preserve the trail.
   RLS forbids UPDATE/DELETE by any client (see 0002_rls.sql).';

-- ============================================================================
-- 7. priority_overrides  (append-only; coordinator/admin only)
-- ============================================================================
create table if not exists public.priority_overrides (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  overridden_by uuid not null references public.profiles(id) on delete restrict,
  previous_score integer,
  new_score     integer not null check (new_score between 0 and 100),
  -- A reason is REQUIRED so overrides are explainable (the "explainable
  -- prioritization" requirement from docs/PRODUCT_SCOPE.md).
  reason        text not null check (length(reason) > 0),
  created_at    timestamptz not null default now()
);

comment on table public.priority_overrides is
  'Append-only record of priority-score overrides. Only an event
   coordinator or admin may insert (RLS in 0002_rls.sql). A non-empty
   reason is required for explainability. RLS forbids UPDATE/DELETE.';

-- ============================================================================
-- 8. audit_events  (append-only security & compliance audit log)
-- ============================================================================
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  -- actor is ON DELETE SET NULL so the trail survives user deletion
  -- (docs/SECURITY.md §4, ADR-012).
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null
              check (action in (
                'login','logout','auth_failed','upload','analyze',
                'review','delete','status_change','permission_denied',
                'register','priority_override'
              )),
  -- Polymorphic target (report id, user id, event id, ...). target_type
  -- disambiguates.
  target_id   uuid,
  target_type text,
  metadata    jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only security & compliance audit log. Ordinary clients can
   append ONLY via the write_audit_event() SECURITY DEFINER function
   (0002_rls.sql) — direct INSERT/UPDATE/DELETE are revoked. SELECT is
   admin-only. actor is ON DELETE SET NULL so the trail survives user
   deletion (docs/SECURITY.md §4, ADR-012).';

-- ============================================================================
-- 9. Indices
-- ============================================================================
create index if not exists idx_reports_event_id       on public.reports(event_id);
create index if not exists idx_reports_creator_id     on public.reports(creator_id);
create index if not exists idx_reports_status         on public.reports(status);
create index if not exists idx_reports_created_at    on public.reports(created_at desc);
create index if not exists idx_reports_location_src   on public.reports(location_source);
create index if not exists idx_reports_sha256         on public.reports(sha256);

create index if not exists idx_analyses_report_id    on public.report_analyses(report_id);
create index if not exists idx_analyses_processing    on public.report_analyses(processing_status);

create index if not exists idx_review_actions_report on public.review_actions(report_id);
create index if not exists idx_review_actions_reviewer on public.review_actions(reviewer_id);
create index if not exists idx_review_actions_created on public.review_actions(created_at desc);

create index if not exists idx_priority_overrides_report on public.priority_overrides(report_id);
create index if not exists idx_priority_overrides_by     on public.priority_overrides(overridden_by);

create index if not exists idx_audit_actor              on public.audit_events(actor_id);
create index if not exists idx_audit_action             on public.audit_events(action);
create index if not exists idx_audit_created            on public.audit_events(created_at desc);
create index if not exists idx_audit_target             on public.audit_events(target_id);

create index if not exists idx_event_members_event      on public.event_members(event_id);
create index if not exists idx_event_members_user       on public.event_members(user_id);

-- ============================================================================
-- 10. updated_at trigger function + per-table triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','events','reports','report_analyses'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at
         before update on public.%I
         for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- 11. Trigger: create a profile when an auth.users row is created
-- ============================================================================
-- (Supabase convention: a trigger on auth.users inserts a matching
--  profiles row with the default 'reporter' role. The profile is then
--  promoted to reviewer/admin or added to event_members by an admin.)
--
-- IMPORTANT: do NOT name this trigger `on_auth_user_created` — that name
-- is used by Supabase's GoTrue Auth service for its OWN trigger (which
-- creates the `auth.identities` row on signup). If we `drop trigger if
-- exists on_auth_user_created`, we clobber Supabase's trigger, and new
-- users can't sign in (no `auth.identities` row = GoTrue rejects the
-- login). Use a unique name (`trg_handle_new_user`) so both triggers
-- fire independently: Supabase's creates the identities row, ours
-- creates the profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'name', ''), 200));
  return new;
end;
$$;

-- Do NOT drop the existing `on_auth_user_created` trigger — it belongs
-- to Supabase's GoTrue Auth service. Create ours with a unique name.
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- End of 0001_schema.sql
-- ============================================================================
