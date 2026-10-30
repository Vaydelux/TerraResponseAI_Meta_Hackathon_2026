-- 0005_postgis.sql
-- ============================================================================
-- Phase 17 — PostGIS Integration & Geospatial Intelligence
-- ============================================================================
-- Enables the PostGIS extension, adds a canonical geography(POINT, 4326)
-- column to the reports table, backfills it from existing lat/lon values,
-- creates a GiST spatial index, and defines two SECURITY INVOKER RPC
-- functions for nearby-incident and map-viewport queries.
--
-- Safe migration strategy:
--   * Uses `create extension if not exists` (idempotent).
--   * Uses `extensions` schema for PostGIS (the Supabase recommended
--     dedicated schema for extensions on new installs).
--   * Does NOT drop or recreate existing tables.
--   * Does NOT modify existing columns (latitude, longitude, location_source).
--   * Backfill is a simple UPDATE that only touches rows with non-null
--     coords + a null geo column.
--   * All RPC functions are SECURITY INVOKER (run with the caller's
--     privileges; RLS applies).
--
-- Per the brief:
--   - "Use the dedicated extensions schema for a new installation."
--   - "Do not reinstall or relocate an existing extension unnecessarily."
--   - "Prefer SECURITY INVOKER."
--   - "Set a safe, explicit function search_path."
--   - "Fully qualify table names and extension functions."
--   - "Enforce event-specific access."
-- ============================================================================

-- ============================================================================
-- 1. Enable PostGIS
-- ============================================================================
-- Supabase projects created after 2023-10 have the `extensions` schema
-- pre-configured. If the schema doesn't exist, create it. If PostGIS is
-- already installed (e.g., in `public`), this `if not exists` is a no-op.
create schema if not exists extensions;

-- Enable PostGIS in the extensions schema. If it's already enabled in a
-- different schema, this will fail with a clear error (not a silent
-- relocation). Report the situation; do not attempt to move it.
create extension if not exists postgis with schema extensions;

-- ============================================================================
-- 2. Add the canonical geography(POINT, 4326) column
-- ============================================================================
-- The column is nullable: reports with location_source='unknown' have
-- null coords and therefore a null geo column. Reports with gps/manual
-- have non-null coords and a non-null geo column.
--
-- The geo column is the canonical spatial representation. All spatial
-- queries (nearby, viewport) use this column + the GiST index. The
-- existing latitude/longitude columns remain for backward compatibility
-- (the application reads/writes those; the trigger keeps geo in sync).
alter table public.reports
  add column if not exists geo extensions.geography(POINT, 4326);

-- ============================================================================
-- 3. Backfill the geo column from existing lat/lon values
-- ============================================================================
-- Only touches rows that have non-null lat/lon but a null geo column.
-- Preserves all existing data; doesn't touch unknown-location reports.
-- Uses ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
-- to create the point. Note: ST_MakePoint takes (x, y) = (longitude,
-- latitude), per the brief: "Longitude represents the X coordinate."
update public.reports
set geo = extensions.ST_SetSRID(
           extensions.ST_MakePoint(longitude, latitude),
           4326
         )::extensions.geography(POINT, 4326)
where latitude is not null
  and longitude is not null
  and geo is null;

-- ============================================================================
-- 4. Trigger to keep the geo column synchronized on INSERT/UPDATE
-- ============================================================================
-- When latitude or longitude changes (e.g., reviewer correction), the
-- trigger updates the geo column. If both are null (unknown location),
-- the geo column is set to null.
create or replace function public.sync_report_geo()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geo = extensions.ST_SetSRID(
                extensions.ST_MakePoint(new.longitude, new.latitude),
                4326
              )::extensions.geography(POINT, 4326);
  else
    new.geo = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_report_geo on public.reports;
create trigger trg_sync_report_geo
  before insert or update of latitude, longitude on public.reports
  for each row
  execute function public.sync_report_geo();

-- ============================================================================
-- 5. GiST spatial index
-- ============================================================================
-- A GiST index on the geo column enables efficient ST_DWithin (radius
-- search) and ST_Intersects (viewport) queries. The partial index
-- (WHERE geo IS NOT NULL) avoids indexing null-geo rows (unknown-
-- location reports), keeping the index small.
create index if not exists idx_reports_geo_gist
  on public.reports using gist (geo)
  where geo is not null;

-- ============================================================================
-- 6. RPC function: nearby reports
-- ============================================================================
-- Returns reports within a given radius (meters) of a center point,
-- scoped to the caller's event membership (enforced by RLS since the
-- function is SECURITY INVOKER).
--
-- Parameters:
--   p_event_id   — the event to search within (required)
--   p_lat        — center latitude (-90..90)
--   p_lon        — center longitude (-180..180)
--   p_radius_m   — search radius in meters (max 50000 = 50km)
--   p_limit      — max results (default 20, max 100)
--   p_offset     — pagination offset (default 0)
--
-- Returns: id, title, status, review_outcome, location_source,
--          latitude, longitude, priority_score, incident_type,
--          distance_meters, created_at
--
-- Security:
--   * SECURITY INVOKER — runs with the caller's privileges.
--   * RLS on reports enforces: caller must be creator or event
--     reviewer+ to see each row.
--   * Event membership is checked explicitly (defense-in-depth with RLS).
--   * No image URLs or storage keys are returned.
--   * Null-geo rows (unknown location) are excluded.
-- ============================================================================

create or replace function public.nearby_reports(
  p_event_id   uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_radius_m   integer default 1000,
  p_limit      integer default 20,
  p_offset     integer default 0
)
returns table (
  id              uuid,
  title           text,
  status          text,
  review_outcome  text,
  location_source text,
  latitude        double precision,
  longitude       double precision,
  priority_score  integer,
  incident_type   text,
  distance_meters double precision,
  created_at      timestamptz
)
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  -- Validate inputs
  if p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid latitude: must be between -90 and 90';
  end if;
  if p_lon is null or p_lon < -180 or p_lon > 180 then
    raise exception 'Invalid longitude: must be between -180 and 180';
  end if;
  if p_radius_m is null or p_radius_m <= 0 or p_radius_m > 50000 then
    raise exception 'Invalid radius: must be between 1 and 50000 meters';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 100 then
    p_limit := 20;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  -- Event membership check (defense-in-depth with RLS)
  if not public.is_event_member(p_event_id) then
    raise exception 'You are not a member of this event';
  end if;

  return query
  select
    r.id,
    r.title,
    r.status,
    r.review_outcome,
    r.location_source,
    r.latitude,
    r.longitude,
    r.priority_score,
    (r.report_analyses -> 0 -> 'structured_observation' ->> 'incident_type')::text as incident_type,
    extensions.ST_Distance(
      r.geo,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography(POINT, 4326)
    )::double precision as distance_meters,
    r.created_at
  from public.reports r
  left join lateral (
    select json_agg(ra.structured_observation) as report_analyses
    from public.report_analyses ra
    where ra.report_id = r.id
  ) ra_agg on true
  where r.event_id = p_event_id
    and r.geo is not null
    and extensions.ST_DWithin(
      r.geo,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography(POINT, 4326),
      p_radius_m
    )
  order by distance_meters asc
  limit p_limit
  offset p_offset;
end;
$$;

-- Revoke execute from anon/public; only authenticated can call.
revoke execute on function public.nearby_reports(uuid, double precision, double precision, integer, integer, integer) from anon, public;
grant execute on function public.nearby_reports(uuid, double precision, double precision, integer, integer, integer) to authenticated;

-- ============================================================================
-- 7. RPC function: map viewport query
-- ============================================================================
-- Returns reports within a bounding box (southwest, northeast corners),
-- scoped to the caller's event membership.
--
-- Parameters:
--   p_event_id  — the event to search within (required)
--   p_sw_lat    — southwest latitude
--   p_sw_lon    — southwest longitude
--   p_ne_lat    — northeast latitude
--   p_ne_lon    — northeast longitude
--   p_limit     — max results (default 200, max 500)
--
-- Handles antimeridian crossing: if sw_lon > ne_lon, the query wraps
-- around the 180/-180 boundary.
-- ============================================================================

create or replace function public.viewport_reports(
  p_event_id  uuid,
  p_sw_lat    double precision,
  p_sw_lon    double precision,
  p_ne_lat    double precision,
  p_ne_lon    double precision,
  p_limit     integer default 200
)
returns table (
  id              uuid,
  title           text,
  status          text,
  review_outcome  text,
  location_source text,
  latitude        double precision,
  longitude       double precision,
  priority_score  integer,
  incident_type   text,
  created_at      timestamptz
)
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
begin
  -- Validate inputs
  if p_sw_lat is null or p_sw_lat < -90 or p_sw_lat > 90 then
    raise exception 'Invalid southwest latitude';
  end if;
  if p_ne_lat is null or p_ne_lat < -90 or p_ne_lat > 90 then
    raise exception 'Invalid northeast latitude';
  end if;
  if p_sw_lat >= p_ne_lat then
    raise exception 'Southwest latitude must be less than northeast latitude';
  end if;
  if p_sw_lon is null or p_sw_lon < -180 or p_sw_lon > 180 then
    raise exception 'Invalid southwest longitude';
  end if;
  if p_ne_lon is null or p_ne_lon < -180 or p_ne_lon > 180 then
    raise exception 'Invalid northeast longitude';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 500 then
    p_limit := 200;
  end if;

  -- Event membership check
  if not public.is_event_member(p_event_id) then
    raise exception 'You are not a member of this event';
  end if;

  return query
  select
    r.id,
    r.title,
    r.status,
    r.review_outcome,
    r.location_source,
    r.latitude,
    r.longitude,
    r.priority_score,
    (ra_agg.report_analyses -> 0 -> 'structured_observation' ->> 'incident_type')::text as incident_type,
    r.created_at
  from public.reports r
  left join lateral (
    select json_agg(ra.structured_observation) as report_analyses
    from public.report_analyses ra
    where ra.report_id = r.id
  ) ra_agg on true
  where r.event_id = p_event_id
    and r.geo is not null
    and extensions.ST_Intersects(
      r.geo,
      extensions.ST_MakeEnvelope(
        p_sw_lon, p_sw_lat, p_ne_lon, p_ne_lat, 4326
      )::extensions.geography
    )
  order by r.created_at desc
  limit p_limit;
end;
$$;

revoke execute on function public.viewport_reports(uuid, double precision, double precision, double precision, double precision, integer) from anon, public;
grant execute on function public.viewport_reports(uuid, double precision, double precision, double precision, double precision, integer) to authenticated;

-- ============================================================================
-- 8. Comment
-- ============================================================================
comment on table public.reports is
  'A disaster-photo submission. The geo column (extensions.geography(POINT, 4326))
   is the canonical spatial representation, kept in sync with latitude/longitude
   by the trg_sync_report_geo trigger. Unknown-location reports have a null geo
   column and are excluded from spatial queries.';
