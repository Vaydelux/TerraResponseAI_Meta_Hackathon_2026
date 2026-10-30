-- TerraResponse AI — corrected PostGIS incident-type projection.
--
-- The preceding migration aggregates ra.structured_observation directly:
--   json_agg(ra.structured_observation)
-- Each array element is already the observation object; there is no
-- nested "structured_observation" property to descend into.
-- The older expression therefore yielded NULL for incident_type.
--
-- Keep existing function signatures, security-invoker enforcement,
-- event membership gates, active retention filtering, antimeridian
-- logic, and execute grants intact. No rows are rewritten.
--
-- Apply only after a reviewed staging dry-run and explicit approval.

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
    (ra_agg.report_analyses -> 0 ->> 'incident_type')::text as incident_type,
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
    and r.retention_state = 'active'
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
    (ra_agg.report_analyses -> 0 ->> 'incident_type')::text as incident_type,
    r.created_at
  from public.reports r
  left join lateral (
    select json_agg(ra.structured_observation) as report_analyses
    from public.report_analyses ra
    where ra.report_id = r.id
  ) ra_agg on true
  where r.event_id = p_event_id
    and r.geo is not null
    and r.retention_state = 'active'
    and (
      case when p_sw_lon <= p_ne_lon then
        extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(p_sw_lon, p_sw_lat, p_ne_lon, p_ne_lat, 4326)
            ::extensions.geography
        )
      else
        extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(p_sw_lon, p_sw_lat, 180, p_ne_lat, 4326)
            ::extensions.geography
        )
        or extensions.ST_Intersects(
          r.geo,
          extensions.ST_MakeEnvelope(-180, p_sw_lat, p_ne_lon, p_ne_lat, 4326)
            ::extensions.geography
        )
      end
    )
  order by r.created_at desc
  limit p_limit;
end;
$$;

