-- 0004_resilience_rollback.sql
-- Rollback for 0004_resilience.sql.
-- Run BEFORE the forward migration when re-applying; or after a
-- failed forward.

-- 1. Trigger + function
drop trigger if exists trg_sync_reports_retention_state on public.report_retention;
drop function if exists public.sync_reports_retention_state();

-- 2. reports.retention_state
drop index if exists idx_reports_retention_state;
alter table public.reports drop column if exists retention_state;

-- 3. report_retention
drop table if exists public.report_retention cascade;

-- 4. evidence_signed_url_log
drop table if exists public.evidence_signed_url_log cascade;

-- 5. ai_usage_log
drop table if exists public.ai_usage_log cascade;
