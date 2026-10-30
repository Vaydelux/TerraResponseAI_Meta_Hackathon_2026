-- ============================================================================
-- TerraResponse AI — Full rollback (reverse of 0001/0002/0003)
-- ============================================================================
-- Run order: 0001_rollback.sql (this file) drops everything created by
-- the three forward migrations. It is safe to run on a fresh DB
-- (every drop is IF EXISTS).
--
-- WARNING: this is destructive. It drops ALL TerraResponse tables,
-- functions, triggers, and storage buckets. Use only to reset a
-- staging/dev database or to fully uninstall.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Storage buckets + their policies (Supabase auto-creates policies
--    named <bucket>_<action>_<role>; we drop the buckets which cascades
--    the policies. We also drop our helper functions.)
-- ---------------------------------------------------------------------------
drop function if exists public.storage_event_reviewer_or_higher(text);
drop function if exists public.storage_event_contributor_or_higher(text);
drop function if exists public.storage_event_member(text);

delete from storage.buckets where id in (
  'evidence-originals','evidence-derivatives','evidence-thumbnails'
);

-- Storage object-level policies are dropped automatically when the
-- bucket row is deleted, but be defensive for policies created with
-- `on storage.objects` (which are bucket-agnostic). Drop our named
-- policies explicitly.
drop policy if exists originals_select_event_reviewer_or_admin on storage.objects;
drop policy if exists originals_insert_event_contributor      on storage.objects;
drop policy if exists originals_update_admin                  on storage.objects;
drop policy if exists originals_delete_admin                  on storage.objects;
drop policy if exists derivatives_select_event_member        on storage.objects;
drop policy if exists derivatives_update_admin                on storage.objects;
drop policy if exists derivatives_delete_admin                on storage.objects;
drop policy if exists thumbnails_select_event_member          on storage.objects;
drop policy if exists thumbnails_update_admin                on storage.objects;
drop policy if exists thumbnails_delete_admin                 on storage.objects;


-- ---------------------------------------------------------------------------
-- 1. audit_events append-only function + RLS policies
-- ---------------------------------------------------------------------------
drop function if exists public.write_audit_event(
  text, uuid, text, jsonb, inet, text
);
drop policy if exists audit_events_select_admin on public.audit_events;
alter table public.audit_events disable row level security;

-- Restore default grants we revoked (idempotent; harmless if table is dropped).
grant insert, update, delete on public.audit_events to authenticated;


-- ---------------------------------------------------------------------------
-- 2. priority_overrides — policies
-- ---------------------------------------------------------------------------
drop policy if exists priority_overrides_insert_coordinator_or_admin on public.priority_overrides;
drop policy if exists priority_overrides_select                       on public.priority_overrides;
alter table public.priority_overrides disable row level security;
grant update, delete, truncate on public.priority_overrides to authenticated;


-- ---------------------------------------------------------------------------
-- 3. review_actions — policies
-- ---------------------------------------------------------------------------
drop policy if exists review_actions_insert_admin            on public.review_actions;
drop policy if exists review_actions_insert_reviewer_not_self on public.review_actions;
drop policy if exists review_actions_select_via_report       on public.review_actions;
alter table public.review_actions disable row level security;
grant update, delete, truncate on public.review_actions to authenticated;


-- ---------------------------------------------------------------------------
-- 4. report_analyses — policies
-- ---------------------------------------------------------------------------
drop policy if exists analyses_delete_admin     on public.report_analyses;
drop policy if exists analyses_update_admin     on public.report_analyses;
drop policy if exists analyses_insert_event_reviewer on public.report_analyses;
drop policy if exists analyses_select_via_report on public.report_analyses;
alter table public.report_analyses disable row level security;


-- ---------------------------------------------------------------------------
-- 5. reports — policies
-- ---------------------------------------------------------------------------
drop policy if exists reports_delete_creator_pre_review_or_admin    on public.reports;
drop policy if exists reports_update_event_reviewer_or_admin        on public.reports;
drop policy if exists reports_update_creator_pre_review             on public.reports;
drop policy if exists reports_insert_contributor_self               on public.reports;
drop policy if exists reports_select_creator_or_event_reviewer_or_admin on public.reports;
alter table public.reports disable row level security;


-- ---------------------------------------------------------------------------
-- 6. event_members — policies
-- ---------------------------------------------------------------------------
drop policy if exists event_members_delete_coordinator_or_admin   on public.event_members;
drop policy if exists event_members_update_coordinator_or_admin    on public.event_members;
drop policy if exists event_members_insert_coordinator_or_admin    on public.event_members;
drop policy if exists event_members_select_member_or_admin         on public.event_members;
alter table public.event_members disable row level security;


-- ---------------------------------------------------------------------------
-- 7. events — policies
-- ---------------------------------------------------------------------------
drop policy if exists events_delete_admin                  on public.events;
drop policy if exists events_update_coordinator_or_admin   on public.events;
drop policy if exists events_insert_admin                  on public.events;
drop policy if exists events_select_member_or_admin       on public.events;
alter table public.events disable row level security;


-- ---------------------------------------------------------------------------
-- 8. profiles — policies
-- ---------------------------------------------------------------------------
drop policy if exists profiles_delete_admin                    on public.profiles;
drop policy if exists profiles_update_admin                    on public.profiles;
drop policy if exists profiles_update_self_no_role_change      on public.profiles;
drop policy if exists profiles_insert_self                     on public.profiles;
drop policy if exists profiles_select_self_or_admin            on public.profiles;
alter table public.profiles disable row level security;


-- ---------------------------------------------------------------------------
-- 9. RLS helper functions
-- ---------------------------------------------------------------------------
drop function if exists public.is_event_coordinator_or_admin(uuid);
drop function if exists public.is_event_contributor_or_higher(uuid);
drop function if exists public.is_event_reviewer_or_higher(uuid);
drop function if exists public.is_event_member(uuid);
drop function if exists public.event_role(uuid, uuid);
drop function if exists public.is_admin();


-- ---------------------------------------------------------------------------
-- 10. Triggers + trigger functions
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop trigger if exists trg_report_analyses_updated_at on public.report_analyses;
drop trigger if exists trg_reports_updated_at          on public.reports;
drop trigger if exists trg_events_updated_at           on public.events;
drop trigger if exists trg_profiles_updated_at        on public.profiles;
drop function if exists public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 11. Tables (reverse dependency order)
-- ---------------------------------------------------------------------------
drop table if exists public.audit_events;
drop table if exists public.priority_overrides;
drop table if exists public.review_actions;
drop table if exists public.report_analyses;
drop table if exists public.reports;
drop table if exists public.event_members;
drop table if exists public.events;
drop table if exists public.profiles;


-- ---------------------------------------------------------------------------
-- 12. Extension (leave pgcrypto — it may be used by other schemas)
-- ---------------------------------------------------------------------------
-- drop extension if exists pgcrypto;


-- ============================================================================
-- End of 0001_rollback.sql
-- ============================================================================
