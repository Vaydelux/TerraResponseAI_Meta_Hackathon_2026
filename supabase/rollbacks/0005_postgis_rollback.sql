-- 0005_postgis_rollback.sql
-- Rollback for 0005_postgis.sql.
-- Run this BEFORE re-applying the forward migration when re-applying.

-- 1. Drop the RPC functions
drop function if exists public.viewport_reports(uuid, double precision, double precision, double precision, double precision, integer);
drop function if exists public.nearby_reports(uuid, double precision, double precision, integer, integer, integer);

-- 2. Drop the trigger + function
drop trigger if exists trg_sync_report_geo on public.reports;
drop function if exists public.sync_report_geo();

-- 3. Drop the GiST index
drop index if exists idx_reports_geo_gist;

-- 4. Drop the geo column
alter table public.reports drop column if exists geo;

-- 5. Do NOT drop the postgis extension (it may be used by other
--    projects on the same Supabase instance; dropping it would be
--    destructive). If a full teardown is needed, do it manually:
--    drop extension if exists postgis cascade;
--    (but NEVER do this on a shared/production database)
