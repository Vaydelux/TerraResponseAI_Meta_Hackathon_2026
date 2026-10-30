-- 0004_resilience.sql
-- ============================================================================
-- Phase 12 — Resilience & Security
-- ============================================================================
-- Adds the tables that back the new resilience + privacy controls:
--   1. ai_usage_log       — telemetry per AI call (cost, tokens, latency,
--                           failure_kind). NO secrets, NO image bytes, NO
--                           raw model response text. The provider's
--                           request_id is stored for billing correlation.
--   2. evidence_signed_url_log — per-mint audit trail for signed URLs
--                                 (rate-limit + access-test surface).
--   3. report_retention   — per-report retention policy + deletion
--                           workflow (soft-delete + hard-delete tracking).
-- The retention table drives the cleanup endpoint (DELETE /api/reports/[id])
-- and the scheduled purge. See docs/SECURITY.md §3 (privacy boundaries).
--
-- Design notes:
--   - All tables are append-only (INSERT only) EXCEPT report_retention,
--     which has a controlled UPDATE for the state transition
--     (active → soft_deleted → purged).
--   - ai_usage_log has NO raw model response text (SECURITY.md §6.4).
--   - The user_id column on ai_usage_log is NULL for service-role
--     poller-driven retries; the user_id of the original request is
--     preserved on the report row.
--   - The estimated_cost_usd column is a rough upper-bound estimate
--     (labeled as such in the UI); the provider bill is the source of
--     truth. Used for ceiling enforcement, not billing.

-- ============================================================================
-- 1. ai_usage_log — AI call telemetry (cost-control + audit)
-- ============================================================================
create table if not exists public.ai_usage_log (
  id                      uuid primary key default gen_random_uuid(),

  -- Which call. report_id is null for calls that failed before the
  -- report could be associated (e.g., a storage download failure).
  -- We still log the attempt so the daily ceiling can count it.
  report_id               uuid references public.reports(id) on delete set null,
  event_id                uuid references public.events(id) on delete set null,
  user_id                 uuid references public.profiles(id) on delete set null,

  -- What model + which prompt produced this. Together with the
  -- report_analyses row this reconstructs the inference run. The
  -- prompt_version is the version of src/lib/ai/prompt.ts.
  model_id                text not null,
  prompt_version          text not null,
  schema_version          text not null,

  -- The provider's request id (for billing correlation). NULL if
  -- the provider didn't return one. NOT the user's request id.
  provider_request_id     text,

  -- Token usage from the provider's usage metadata. NULL when the
  -- provider doesn't return usage (in which case estimated_cost_usd
  -- uses the flat per-call rate).
  prompt_tokens           integer,
  completion_tokens       integer,
  total_tokens            integer,

  -- Latency of the model call (ms), including retries.
  latency_ms              integer,

  -- Rough USD estimate (labeled as "estimated" in the UI). The
  -- provider bill is the source of truth. See cost-controls.ts.
  estimated_cost_usd      numeric(12,6) not null default 0,
  cost_basis              text not null default 'flat'
                          check (cost_basis in ('tokens','flat')),

  -- Outcome. 'succeeded' = the model returned a valid observation.
  -- 'transient_failed' = the model call itself failed but a retry
  -- may succeed (429/5xx/timeout). 'permanent_failed' = the model
  -- returned a permanent error (4xx). 'schema_invalid' = the model
  -- returned a response that failed Zod. 'budget_exhausted' = the
  -- ceiling blocked the call (no model invocation).
  -- 'rate_limited' = a per-user/per-event rate limit blocked.
  outcome                 text not null
                          check (outcome in (
                            'succeeded',
                            'transient_failed',
                            'permanent_failed',
                            'schema_invalid',
                            'budget_exhausted',
                            'rate_limited',
                            'download_failed'
                          )),
  failure_kind             text,
  -- A short, sanitized error message. NO secrets, NO raw response
  -- text. The raw error is logged server-side via console.error.
  error_message           text,

  -- UTC day stamp for the daily rollup.
  utc_day                 date not null,

  occurred_at             timestamptz not null default now()
);

create index if not exists idx_ai_usage_log_user_time
  on public.ai_usage_log(user_id, occurred_at);
create index if not exists idx_ai_usage_log_event
  on public.ai_usage_log(event_id);
create index if not exists idx_ai_usage_log_utc_day
  on public.ai_usage_log(utc_day);
create index if not exists idx_ai_usage_log_report
  on public.ai_usage_log(report_id);

comment on table public.ai_usage_log is
  'Per-AI-call telemetry. Holds model_id, prompt_version, token counts,
   latency, estimated cost, and outcome. NO secrets, NO image bytes,
   NO raw model response text (SECURITY.md §6.4). Used for cost ceilings
   and audit; the provider bill is the source of truth for actual cost.';

-- RLS: same as report_analyses — anyone who can SELECT the parent
-- report can SELECT its usage log entries. Admin sees all.
-- H-5 fix from the Phase 17 audit: the original policy had
-- `report_id is null` as the first OR branch — ANY authenticated
-- user could read system-call telemetry (model_id, prompt_version,
-- token counts, latency, error messages) for calls that failed
-- before a report could be associated. Those rows are exactly the
-- ones that should be admin-only. Removed.
alter table public.ai_usage_log enable row level security;
create policy ai_usage_log_select_via_report
  on public.ai_usage_log for select
  to authenticated
  using (
    public.is_admin()
    or (
      report_id is not null
      and exists (
        select 1 from public.reports r
        where r.id = report_id
        and (
          r.creator_id = auth.uid()
          or public.is_event_reviewer_or_higher(r.event_id)
        )
      )
    )
  );
-- INSERT: service role (poller) + authenticated users (route handlers).
-- The route handler is responsible for inserting the correct user_id.
create policy ai_usage_log_insert_authenticated
  on public.ai_usage_log for insert
  to authenticated, service_role
  with check (true);
-- UPDATE / DELETE: admin only. Telemetry is append-only for everyone
-- else (a contributor can't rewrite their own usage log to dodge the
-- ceiling).
create policy ai_usage_log_update_admin
  on public.ai_usage_log for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy ai_usage_log_delete_admin
  on public.ai_usage_log for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 2. evidence_signed_url_log — signed-URL audit + rate-limit surface
-- ============================================================================
-- Every mint of a signed URL is logged here. The per-user rate limit
-- (SIGNED_URL_RATE_LIMIT_PER_MIN) counts rows in this table.
create table if not exists public.evidence_signed_url_log (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  report_id               uuid not null references public.reports(id) on delete cascade,
  -- derivative | thumbnail | original
  kind                    text not null
                          check (kind in ('derivative','thumbnail','original')),
  -- TTL the URL was minted with (seconds). The brief: "signed URL
  -- expiration." Stored so an auditor can see how long each URL
  -- was valid for.
  ttl_seconds             integer not null check (ttl_seconds > 0 and ttl_seconds <= 300),
  occurred_at             timestamptz not null default now()
);

create index if not exists idx_signed_url_log_user_time
  on public.evidence_signed_url_log(user_id, occurred_at);
create index if not exists idx_signed_url_log_report
  on public.evidence_signed_url_log(report_id);

comment on table public.evidence_signed_url_log is
  'Audit trail for evidence signed-URL mints. Drives the per-user
   rate limit (SIGNED_URL_RATE_LIMIT_PER_MIN) and the access test
   (a reviewer can verify who viewed a report''s evidence and when).';

-- RLS: insert by authenticated; select by admin or the report's
-- creator/event-reviewer (same visibility as the report).
alter table public.evidence_signed_url_log enable row level security;
create policy signed_url_log_select_via_report
  on public.evidence_signed_url_log for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );
create policy signed_url_log_insert_authenticated
  on public.evidence_signed_url_log for insert
  to authenticated
  with check (
    -- M-7 fix from the Phase 17 audit: the original policy only
    -- checked `user_id = auth.uid()`. A user could INSERT a row
    -- with an arbitrary report_id (polluting the audit trail). The
    -- route handler mitigates this (the report RLS check returns
    -- 404 before the audit insert), but defense-in-depth says the
    -- policy should validate the report is visible to the caller.
    user_id = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );
create policy signed_url_log_delete_admin
  on public.evidence_signed_url_log for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 3. report_retention — per-report retention + deletion workflow
-- ============================================================================
-- Tracks the lifecycle of the EVIDENCE (the storage objects) and the
-- reports row. The reports row itself is NOT deleted by the cleanup
-- endpoint; instead, the storage objects are purged first, and the
-- reports row is preserved with retention_state = 'purged' so the
-- audit trail (review_actions, ai_usage_log) remains intact.
--
-- States:
--   active       — evidence exists in private storage; report is live.
--   soft_deleted — contributor or reviewer requested deletion; the
--                  signed-URL endpoint refuses to mint new URLs. The
--                  storage objects are NOT yet deleted (the retention
--                  window applies).
--   purged       — storage objects have been removed. The reports row
--                  still exists (with the storage keys blanked) so the
--                  audit trail survives.
create table if not exists public.report_retention (
  id                      uuid primary key default gen_random_uuid(),
  report_id               uuid not null unique
                          references public.reports(id) on delete cascade,

  retention_state         text not null default 'active'
                          check (retention_state in (
                            'active','soft_deleted','purged'
                          )),

  -- The retention window: the earliest time the storage objects can
  -- be purged. After a soft-delete request, this is set to
  -- now() + RETENTION_WINDOW_DAYS (default 7). The purge endpoint
  -- refuses to purge before this time unless retention_window_days
  -- is null (admin override).
  retention_window_ends_at timestamptz,

  -- Free-text reason for the deletion request (e.g., "Contributor
  -- requested removal", "Reviewer rejected — false positive").
  -- Stored so the audit trail can explain the deletion.
  reason                  text,

  -- Who requested the deletion (the contributor themselves, OR a
  -- reviewer/admin). NULL when the row was auto-created at upload.
  requested_by            uuid references public.profiles(id) on delete set null,

  -- When the storage objects were actually purged (NULL until the
  -- purge runs). Stored so an auditor can see the lag between the
  -- soft-delete request and the actual purge.
  purged_at               timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_report_retention_state
  on public.report_retention(retention_state);
create index if not exists idx_report_retention_window
  on public.report_retention(retention_window_ends_at)
  where retention_state = 'soft_deleted';

comment on table public.report_retention is
  'Per-report evidence retention + deletion workflow. Drives the
   DELETE /api/reports/[id] endpoint and the scheduled purge. The
   reports row itself is preserved (with storage keys blanked) so the
   audit trail survives.';

-- RLS: same visibility as the report. INSERT by the report's
-- creator or event reviewer+. UPDATE by admin or event coordinator+.
-- (The contributor can request soft-delete on their own report; the
-- transition to purged is admin/purge-service only.)
alter table public.report_retention enable row level security;
create policy report_retention_select_via_report
  on public.report_retention for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );
create policy report_retention_insert_via_report
  on public.report_retention for insert
  to authenticated
  with check (
    -- retention_state constraint (H-2 fix from the Phase 17 audit):
    -- a contributor could otherwise INSERT a retention row with
    -- retention_state = 'purged', which the sync_reports_retention_state
    -- trigger would propagate to reports.retention_state, locking
    -- everyone out of the evidence (self-DoS). Block at INSERT.
    retention_state in ('active','soft_deleted')
    and exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );
create policy report_retention_update_via_report
  on public.report_retention for update
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  )
  with check (
    -- The state-machine rules (active → soft_deleted → purged, with
    -- revocation gated by original-requester-or-admin) are enforced
    -- by the trg_guard_retention_transition trigger installed in
    -- 0006_security_fixes.sql §6. The trigger CAN use OLD/NEW row
    -- variables (valid in trigger context). The original 0002/0004
    -- version used `new.retention_state = 'purged' and ...` inside
    -- WITH CHECK — invalid SQL (RLS does NOT expose OLD/NEW inside
    -- policy expressions). The trigger is the correct mechanism.
    --
    -- This policy only verifies the candidate row's report is
    -- visible to the caller (the visibility gate). The state-
    -- machine trigger does the rest.
    exists (
      select 1 from public.reports r
      where r.id = report_id
      and (
        r.creator_id = auth.uid()
        or public.is_event_reviewer_or_higher(r.event_id)
        or public.is_admin()
      )
    )
  );

-- ============================================================================
-- 4. reports.retention_state — denormalized for cheap filtering
-- ============================================================================
-- The reports row gets a denormalized retention_state column so the
-- GET /api/reports query can filter soft_deleted / purged reports
-- cheaply (without joining report_retention). Kept in sync via a
-- trigger on report_retention.
alter table public.reports
  add column if not exists retention_state text not null default 'active'
  check (retention_state in ('active','soft_deleted','purged'));

create index if not exists idx_reports_retention_state
  on public.reports(retention_state);

-- Trigger: keep reports.retention_state in sync with
-- report_retention.retention_state.
-- SECURITY DEFINER so the trigger can UPDATE reports.retention_state
-- (a column that is NOT in the mutable-column UPDATE grant list —
-- the 0002 §11 column-level privileges restrict authenticated to
-- updating only status/review_outcome/priority_score/etc., NOT
-- retention_state). Without SECURITY DEFINER, the trigger would
-- fail with "permission denied for table reports" when an
-- authenticated user updates report_retention.
-- The trigger only updates the denormalized retention_state column
-- (the source of truth is report_retention.retention_state). It
-- runs as the table owner, bypassing RLS + column privileges.
create or replace function public.sync_reports_retention_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.reports
  set retention_state = new.retention_state,
      updated_at = now()
  where id = new.report_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_reports_retention_state on public.report_retention;
create trigger trg_sync_reports_retention_state
  after insert or update of retention_state on public.report_retention
  for each row
  execute function public.sync_reports_retention_state();
