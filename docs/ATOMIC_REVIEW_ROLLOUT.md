# Atomic review rollout — TerraResponse AI

The previous reviewer endpoint issued three independent PostgREST writes: append the audit action, change report review status, then update an analysis. This was **not atomic**. Ordinary reviewer RLS also denies direct update to `report_analyses`; corrections could silently fail after the report was marked reviewed. The correction form sent `action: "comment"` while the previous route rejected that value.

Migration `0009_atomic_review_actions.sql` introduces `public.submit_review_atomic`, adds an idempotency UUID to `review_actions`, and keeps the audit, analysis correction and review-state change in one Postgres transaction.

**Do not deploy the updated API before migration 0009 is applied**. It fails closed with a 503 if the RPC is missing. Deploy the DB migration and API as one coordinated staging release, then inspect logs and complete the actual role-isolation tests.

Required staging verification:
1. Run the read-only Supabase migration preview on the dedicated staging project and review the SQL output, including 0008 and 0009.
2. Check that 0009 creates its function and has `SECURITY DEFINER`, `search_path=''`, authenticated-only EXECUTE grants, and explicit JWT user/event/self-review/retention guards.
3. Apply migrations only after explicit approval of the staging target.
4. Test a contributor attempting direct RPC, another event's reviewer, reviewer self-review, an allowed reviewer, and an admin. For all unauthorized cases verify no changes to `reports`, `review_actions`, or `report_analyses`.
5. Simulate a downstream error and confirm the full SQL transaction rolls back. Double-submit the same request UUID and confirm just one `review_actions` row exists. Test concurrent different UUIDs.
6. Test the correction drawer, including 1–5 severity/null, corrected summaries and lists, reviewer identity, latest-first history, and the corrected Seal.
7. Compare the stored `_original_model_output` with the original validated Muse Spark observation after multiple edits.
8. Verify the final live demo in a browser with separate contributor and reviewer accounts.

Do not use a production or emergency-response event as a staging test. No remote SQL or real API calls were executed as part of preparing this PR.
